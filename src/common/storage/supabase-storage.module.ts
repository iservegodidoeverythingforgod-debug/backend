import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseStorageService } from './supabase-storage.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [SupabaseStorageService],
  exports: [SupabaseStorageService],
})
export class SupabaseStorageModule {}
