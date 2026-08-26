import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
import AppDataSource from '../src/data-source';
import {
  User,
  Payment,
  Product,
} from '../src/database/entities';
import {
  SupabaseStorageService,
  BUCKET_MAX_FILE_SIZES,
} from '../src/common/storage/supabase-storage.service';
import { ConfigService } from '@nestjs/config';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env.production') });

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

function isLocalUploadPath(val: string | null | undefined): boolean {
  if (!val) return false;
  return val.startsWith('/uploads/') || val.startsWith('uploads/');
}

function resolveLocalFilePath(localPath: string): string {
  const cleanPath = localPath.replace(/^\/+/, '');
  // Resolve from backend directory or project root
  const rootOption = path.resolve(process.cwd(), cleanPath);
  if (fs.existsSync(rootOption)) {
    return rootOption;
  }
  const backendOption = path.resolve(__dirname, '..', cleanPath);
  return backendOption;
}

async function runMigration() {
  console.log('====================================================');
  console.log('🔄 Starting Migration: Local Uploads -> Supabase S3');
  console.log('====================================================');

  // Initialize DataSource
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const configService = new ConfigService();
  const storageService = new SupabaseStorageService(configService);

  const userRepository = AppDataSource.getRepository(User);
  const paymentRepository = AppDataSource.getRepository(Payment);
  const productRepository = AppDataSource.getRepository(Product);

  let migratedCount = 0;
  let nulledCount = 0;
  let flaggedOversizedCount = 0;

  // 1. Migrate User Avatars
  console.log('\n--- 1. Processing User Avatars ---');
  const users = await userRepository.find();
  for (const user of users) {
    if (isLocalUploadPath(user.avatar_url)) {
      const localPath = resolveLocalFilePath(user.avatar_url!);
      if (fs.existsSync(localPath)) {
        const stats = fs.statSync(localPath);
        const maxAvatarSize = BUCKET_MAX_FILE_SIZES.avatars;
        if (stats.size > maxAvatarSize) {
          console.warn(
            `⚠️ [FLAGGED OVERSIZE] User ${user.id} avatar (${stats.size} bytes) exceeds 8MB limit. Skipping upload.`,
          );
          flaggedOversizedCount++;
          continue;
        }

        const buffer = await fs.promises.readFile(localPath);
        const ext = path.extname(localPath).toLowerCase() || '.png';
        const key = `${user.id}/${randomUUID()}${ext}`;
        const contentType = getMimeType(localPath);

        try {
          const newUrl = await storageService.uploadFile('avatars', key, buffer, contentType);
          user.avatar_url = newUrl;
          await userRepository.save(user);
          console.log(`✅ [User ${user.id}] Re-uploaded avatar -> ${newUrl}`);
          migratedCount++;
        } catch (err: any) {
          console.error(`❌ [User ${user.id}] Failed to re-upload avatar: ${err.message}`);
        }
      } else {
        console.log(`⚠️ [User ${user.id}] Local avatar file "${user.avatar_url}" not found on disk. Nulled out avatar_url.`);
        user.avatar_url = null as any;
        await userRepository.save(user);
        nulledCount++;
      }
    }
  }

  // 2. Migrate Payment Slips
  console.log('\n--- 2. Processing Payment Slips ---');
  const payments = await paymentRepository.find();
  for (const payment of payments) {
    if (isLocalUploadPath(payment.slip_image_url)) {
      const localPath = resolveLocalFilePath(payment.slip_image_url!);
      if (fs.existsSync(localPath)) {
        const stats = fs.statSync(localPath);
        const maxSlipSize = BUCKET_MAX_FILE_SIZES.slips;
        if (stats.size > maxSlipSize) {
          console.warn(
            `⚠️ [FLAGGED OVERSIZE] Payment ${payment.id} slip (${stats.size} bytes) exceeds 3MB limit. Skipping upload.`,
          );
          flaggedOversizedCount++;
          continue;
        }

        const buffer = await fs.promises.readFile(localPath);
        const ext = path.extname(localPath).toLowerCase() || '.jpg';
        const key = `${payment.order_id || payment.id}/${randomUUID()}${ext}`;
        const contentType = getMimeType(localPath);

        try {
          const newUrl = await storageService.uploadFile('slips', key, buffer, contentType);
          payment.slip_image_url = newUrl;
          await paymentRepository.save(payment);
          console.log(`✅ [Payment ${payment.id}] Re-uploaded slip -> ${newUrl}`);
          migratedCount++;
        } catch (err: any) {
          console.error(`❌ [Payment ${payment.id}] Failed to re-upload slip: ${err.message}`);
        }
      } else {
        console.log(`⚠️ [Payment ${payment.id} (Order: ${payment.order_id})] Local slip file "${payment.slip_image_url}" not found on disk. Nulled out slip_image_url.`);
        payment.slip_image_url = null as any;
        await paymentRepository.save(payment);
        nulledCount++;
      }
    }
  }

  // 3. Migrate Product Images
  console.log('\n--- 3. Processing Product Images ---');
  const products = await productRepository.find();
  for (const product of products) {
    if (isLocalUploadPath(product.image_url)) {
      const localPath = resolveLocalFilePath(product.image_url!);
      if (fs.existsSync(localPath)) {
        const stats = fs.statSync(localPath);
        const maxProductSize = BUCKET_MAX_FILE_SIZES.products;
        if (stats.size > maxProductSize) {
          console.warn(
            `⚠️ [FLAGGED OVERSIZE] Product ${product.id} image (${stats.size} bytes) exceeds 8MB limit. Skipping upload.`,
          );
          flaggedOversizedCount++;
          continue;
        }

        const buffer = await fs.promises.readFile(localPath);
        const ext = path.extname(localPath).toLowerCase() || '.jpg';
        const key = `${randomUUID()}${ext}`;
        const contentType = getMimeType(localPath);

        try {
          const newUrl = await storageService.uploadFile('products', key, buffer, contentType);
          product.image_url = newUrl;
          await productRepository.save(product);
          console.log(`✅ [Product ${product.id}] Re-uploaded image -> ${newUrl}`);
          migratedCount++;
        } catch (err: any) {
          console.error(`❌ [Product ${product.id}] Failed to re-upload image: ${err.message}`);
        }
      } else {
        console.log(`⚠️ [Product ${product.id}] Local image file "${product.image_url}" not found on disk. Nulled out image_url.`);
        product.image_url = null as any;
        await productRepository.save(product);
        nulledCount++;
      }
    }
  }

  console.log('\n====================================================');
  console.log('📊 Migration Summary:');
  console.log(`   - Successfully re-uploaded & updated: ${migratedCount}`);
  console.log(`   - Missing local files nulled/cleared: ${nulledCount}`);
  console.log(`   - Flagged oversized files:             ${flaggedOversizedCount}`);
  console.log('====================================================\n');

  await AppDataSource.destroy();
}

runMigration()
  .then(() => {
    console.log('✨ Migration script completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('💥 Fatal error during migration:', err);
    process.exit(1);
  });
