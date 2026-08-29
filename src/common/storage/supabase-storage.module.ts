import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseStorageService } from './supabase-storage.service';
import { StorageCleanupService } from './storage-cleanup.service';
import { StorageController } from './storage.controller';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [StorageController],
  providers: [SupabaseStorageService, StorageCleanupService],
  exports: [SupabaseStorageService, StorageCleanupService],
})
export class SupabaseStorageModule {}
