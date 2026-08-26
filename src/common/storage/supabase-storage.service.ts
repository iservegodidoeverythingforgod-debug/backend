import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

export const BUCKET_NAMES = {
  AVATARS: 'avatars',
  PRODUCTS: 'products',
  IMGSHOT: 'imgshot',
  ANIMATIONS: 'animations',
  SLIPS: 'slips',
} as const;

export const BUCKET_MAX_FILE_SIZES: Record<string, number> = {
  avatars: 8 * 1024 * 1024, // 8 MB
  products: 8 * 1024 * 1024, // 8 MB
  imgshot: 8 * 1024 * 1024, // 8 MB (Product gallery shots)
  animations: 3 * 1024 * 1024, // 3 MB
  slips: 3 * 1024 * 1024, // 3 MB
};

@Injectable()
export class SupabaseStorageService {
  private readonly s3Client: S3Client;
  private readonly publicBaseUrl: string;
  private readonly logger = new Logger(SupabaseStorageService.name);

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('SUPABASE_S3_ENDPOINT') || 'https://placeholder.supabase.co/storage/v1/s3';
    const region = this.configService.get<string>('SUPABASE_S3_REGION') || 'us-east-1';
    const accessKeyId = this.configService.get<string>('SUPABASE_S3_ACCESS_KEY_ID') || 'placeholder_access_key';
    const secretAccessKey = this.configService.get<string>('SUPABASE_S3_SECRET_ACCESS_KEY') || 'placeholder_secret_key';
  
    // Derive the public base URL from the S3 endpoint instead of requiring a separate env var —
    // both live on the same Supabase project host, just different path suffixes:
    //   S3 endpoint:  https://<ref>.supabase.co/storage/v1/s3
    //   Public base:  https://<ref>.supabase.co/storage/v1/object/public
    this.publicBaseUrl = endpoint.replace(/\/storage\/v1\/s3\/?$/, '/storage/v1/object/public');
  
    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }

  /**
   * Resolves a valid Content-Type header from file extension or provided MIME type.
   * Supabase Storage buckets reject 'application/octet-stream' for images/animations.
   */
  private resolveContentType(key: string, providedType?: string): string {
    if (
      providedType &&
      providedType !== 'application/octet-stream' &&
      providedType.trim().length > 0
    ) {
      return providedType.trim();
    }

    const ext = (key.split('.').pop() || '').toLowerCase();
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      case 'svg':
        return 'image/svg+xml';
      case 'json':
        return 'application/json';
      case 'mp4':
        return 'video/mp4';
      case 'webm':
        return 'video/webm';
      default:
        return 'image/jpeg';
    }
  }

  /**
   * Uploads a file buffer to a specified Supabase public bucket.
   *
   * @param bucket - The Supabase Storage bucket name ('avatars' | 'products' | 'imgshot' | 'animations' | 'slips')
   * @param key - The target object key inside the bucket
   * @param buffer - The raw file buffer in memory
   * @param contentType - The MIME content type of the file
   * @returns Public URL string pointing to the uploaded object
   */
  async uploadFile(
    bucket: string,
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const maxSize = BUCKET_MAX_FILE_SIZES[bucket];
    if (maxSize && buffer.length > maxSize) {
      const limitMb = Math.round(maxSize / (1024 * 1024));
      throw new BadRequestException(
        `File exceeds ${limitMb}MB limit for ${bucket}`,
      );
    }

    const normalizedKey = key.replace(/^\/+/, '');
    const effectiveContentType = this.resolveContentType(normalizedKey, contentType);

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: normalizedKey,
          Body: buffer,
          ContentType: effectiveContentType,
        }),
      );

      return `${this.publicBaseUrl}/${bucket}/${normalizedKey}`;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Failed to upload file to bucket "${bucket}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new InternalServerErrorException(
        `Failed to upload file to ${bucket} storage`,
      );
    }
  }

  /**
   * Deletes an object from a specified Supabase bucket.
   *
   * @param bucket - The Supabase Storage bucket name
   * @param key - The object key to delete
   */
  async deleteFile(bucket: string, key: string): Promise<void> {
    const normalizedKey = key.replace(/^\/+/, '');

    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: normalizedKey,
        }),
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(
        `Failed to delete file from bucket "${bucket}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new InternalServerErrorException(
        `Failed to delete file from ${bucket} storage`,
      );
    }
  }
}
