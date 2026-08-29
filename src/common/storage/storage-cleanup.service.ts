import { Injectable, Logger } from '@nestjs/common';
import { SupabaseStorageService, BUCKET_NAMES } from './supabase-storage.service';
import { DataSource } from 'typeorm';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

export interface ParsedStorageUrl {
  bucket: string;
  key: string;
}

export interface OrphanedFileEntry {
  bucket: string;
  key: string;
  size: number;
  lastModified?: Date;
  publicUrl: string;
}

export interface OrphanScanReport {
  scannedBuckets: string[];
  totalObjectsScanned: number;
  orphanedCount: number;
  totalOrphanedBytes: number;
  orphans: OrphanedFileEntry[];
  scanTimestamp: Date;
}

@Injectable()
export class StorageCleanupService {
  private readonly logger = new Logger(StorageCleanupService.name);
  private readonly s3Client: S3Client;
  private readonly publicBaseUrl: string;

  constructor(
    private readonly supabaseStorageService: SupabaseStorageService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    const endpoint = this.configService.get<string>('SUPABASE_S3_ENDPOINT') || 'https://placeholder.supabase.co/storage/v1/s3';
    const region = this.configService.get<string>('SUPABASE_S3_REGION') || 'us-east-1';
    const accessKeyId = this.configService.get<string>('SUPABASE_S3_ACCESS_KEY_ID') || 'placeholder_access_key';
    const secretAccessKey = this.configService.get<string>('SUPABASE_S3_SECRET_ACCESS_KEY') || 'placeholder_secret_key';

    this.publicBaseUrl = endpoint.replace(/\/storage\/v1\/s3\/?$/, '/storage/v1/object/public');

    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }

  /**
   * Parses a Supabase Public URL or S3 key into bucket and object key.
   * e.g. "https://xxx.supabase.co/storage/v1/object/public/products/abc.jpg" -> { bucket: 'products', key: 'abc.jpg' }
   */
  parseBucketAndKey(fileUrl?: string | null): ParsedStorageUrl | null {
    if (!fileUrl || typeof fileUrl !== 'string' || fileUrl.trim().length === 0) {
      return null;
    }

    const trimmed = fileUrl.trim();

    // Pattern 1: Public object URL
    const publicMatch = trimmed.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (publicMatch) {
      return {
        bucket: publicMatch[1],
        key: publicMatch[2],
      };
    }

    // Pattern 2: S3 endpoint URL
    const s3Match = trimmed.match(/\/storage\/v1\/s3\/([^/]+)\/(.+)$/);
    if (s3Match) {
      return {
        bucket: s3Match[1],
        key: s3Match[2],
      };
    }

    // Pattern 3: Known bucket prefix (e.g. /products/key.jpg or products/key.jpg)
    const knownBuckets = Object.values(BUCKET_NAMES);
    for (const b of knownBuckets) {
      const prefixSlash = `/${b}/`;
      const prefixNoSlash = `${b}/`;
      if (trimmed.includes(prefixSlash)) {
        const parts = trimmed.split(prefixSlash);
        if (parts.length > 1 && parts[1].length > 0) {
          return { bucket: b, key: parts[1] };
        }
      } else if (trimmed.startsWith(prefixNoSlash)) {
        return { bucket: b, key: trimmed.substring(prefixNoSlash.length) };
      }
    }

    return null;
  }

  /**
   * Non-blocking file deletion by URL.
   * Never throws; logs a warning on failure so database operations are not compromised.
   */
  async deleteFileByUrl(fileUrl?: string | null): Promise<boolean> {
    const parsed = this.parseBucketAndKey(fileUrl);
    if (!parsed) {
      return false;
    }

    try {
      await this.supabaseStorageService.deleteFile(parsed.bucket, parsed.key);
      this.logger.log(`[STORAGE CLEANUP] Deleted object '${parsed.key}' from bucket '${parsed.bucket}'`);
      return true;
    } catch (error) {
      this.logger.warn(
        `[STORAGE CLEANUP ERROR] Failed to delete object '${parsed.key}' in bucket '${parsed.bucket}': ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return false;
    }
  }

  /**
   * Batch non-blocking deletion for an array of file URLs.
   */
  async deleteFilesByUrls(fileUrls: (string | undefined | null)[]): Promise<{ deleted: number; failed: number }> {
    const validUrls = fileUrls.filter((u): u is string => Boolean(u && u.trim().length > 0));
    if (validUrls.length === 0) {
      return { deleted: 0, failed: 0 };
    }

    let deleted = 0;
    let failed = 0;

    await Promise.all(
      validUrls.map(async (url) => {
        const success = await this.deleteFileByUrl(url);
        if (success) {
          deleted++;
        } else {
          failed++;
        }
      }),
    );

    return { deleted, failed };
  }

  /**
   * Scans Supabase buckets for orphaned files that have no database record reference.
   * Does NOT auto-delete; returns an actionable report for admin review.
   */
  async scanOrphanedFiles(targetBuckets?: string[]): Promise<OrphanScanReport> {
    const bucketsToScan = targetBuckets && targetBuckets.length > 0
      ? targetBuckets
      : [BUCKET_NAMES.AVATARS, BUCKET_NAMES.PRODUCTS, BUCKET_NAMES.IMGSHOT, BUCKET_NAMES.ANIMATIONS];

    const orphans: OrphanedFileEntry[] = [];
    let totalObjectsScanned = 0;
    let totalOrphanedBytes = 0;

    for (const bucket of bucketsToScan) {
      try {
        const listCmd = new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1000 });
        const listRes = await this.s3Client.send(listCmd);
        const contents = listRes.Contents || [];
        totalObjectsScanned += contents.length;

        for (const obj of contents) {
          if (!obj.Key) continue;
          const key = obj.Key;
          const publicUrl = `${this.publicBaseUrl}/${bucket}/${key}`;

          const isReferenced = await this.checkIfKeyIsReferencedInDb(bucket, key, publicUrl);
          if (!isReferenced) {
            const size = obj.Size || 0;
            totalOrphanedBytes += size;
            orphans.push({
              bucket,
              key,
              size,
              lastModified: obj.LastModified,
              publicUrl,
            });
          }
        }
      } catch (err) {
        this.logger.error(`Error scanning bucket "${bucket}": ${err instanceof Error ? err.message : err}`);
      }
    }

    return {
      scannedBuckets: bucketsToScan,
      totalObjectsScanned,
      orphanedCount: orphans.length,
      totalOrphanedBytes,
      orphans,
      scanTimestamp: new Date(),
    };
  }

  /**
   * Cleans specific verified orphaned files upon explicit admin request.
   */
  async cleanConfirmedOrphans(items: { bucket: string; key: string }[]): Promise<{ deleted: string[]; failed: string[] }> {
    const deleted: string[] = [];
    const failed: string[] = [];

    for (const item of items) {
      try {
        await this.supabaseStorageService.deleteFile(item.bucket, item.key);
        deleted.push(`${item.bucket}/${item.key}`);
      } catch (err) {
        failed.push(`${item.bucket}/${item.key}`);
      }
    }

    return { deleted, failed };
  }

  private async checkIfKeyIsReferencedInDb(bucket: string, key: string, publicUrl: string): Promise<boolean> {
    const runner = this.dataSource.createQueryRunner();
    try {
      if (bucket === BUCKET_NAMES.AVATARS) {
        // Look in users.avatar_url
        const res = await runner.query(
          `SELECT 1 FROM "users" WHERE "avatar_url" LIKE $1 OR "avatar_url" LIKE $2 LIMIT 1`,
          [`%${key}%`, `%${publicUrl}%`],
        );
        return res.length > 0;
      }

      if (bucket === BUCKET_NAMES.PRODUCTS || bucket === BUCKET_NAMES.IMGSHOT) {
        // Look in products.image_url or products.images jsonb
        const res = await runner.query(
          `SELECT 1 FROM "products" WHERE "image_url" LIKE $1 OR "image_url" LIKE $2 OR "images"::text LIKE $1 OR "images"::text LIKE $2 LIMIT 1`,
          [`%${key}%`, `%${publicUrl}%`],
        );
        return res.length > 0;
      }

      if (bucket === BUCKET_NAMES.ANIMATIONS) {
        // Look in animation_assets.file_url or growth_stages.animation
        const res = await runner.query(
          `SELECT 1 FROM "animation_assets" WHERE "file_url" LIKE $1 OR "file_url" LIKE $2
           UNION
           SELECT 1 FROM "growth_stages" WHERE "animation" LIKE $1 OR "animation" LIKE $2
           LIMIT 1`,
          [`%${key}%`, `%${publicUrl}%`],
        );
        return res.length > 0;
      }

      if (bucket === BUCKET_NAMES.SLIPS) {
        // Look in payments.slip_image_url
        const res = await runner.query(
          `SELECT 1 FROM "payments" WHERE "slip_image_url" LIKE $1 OR "slip_image_url" LIKE $2 LIMIT 1`,
          [`%${key}%`, `%${publicUrl}%`],
        );
        return res.length > 0;
      }

      return true;
    } catch (err) {
      this.logger.warn(`Error querying database for storage reference: ${err}`);
      return true; // Treat as referenced on DB query error to avoid accidental orphan flagging
    } finally {
      await runner.release();
    }
  }
}
