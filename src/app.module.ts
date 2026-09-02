import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ReviewsModule } from './reviews/reviews.module';
import { ReportsModule } from './reports/reports.module';
import { ChatModule } from './chat/chat.module';
import { SettingsModule } from './settings/settings.module';
import { SupabaseStorageModule } from './common/storage/supabase-storage.module';
import { GrowthEngineModule } from './growth-engine/growth-engine.module';
import { HealthController } from './health/health.controller';
import {
  User,
  RefreshToken,
  Category,
  Product,
  GrowthRule,
  GrowthStage,
  GrowthCondition,
  Order,
  OrderItem,
  Payment,
  Review,
  ChatConversation,
  ChatMessage,
  AnimationAsset,
  StoreSetting,
  PendingRegistration,
} from './database/entities';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'production' ? '.env.production' : '.env',
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000, // 60 seconds
        limit: 120, // 120 requests per minute
      },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbType = config.get<string>('DB_TYPE') || 'postgres';
        const databaseUrl = config.get<string>('DATABASE_URL');

        const entities = [
          User,
          RefreshToken,
          Category,
          Product,
          GrowthRule,
          GrowthStage,
          GrowthCondition,
          Order,
          OrderItem,
          Payment,
          Review,
          ChatConversation,
          ChatMessage,
          AnimationAsset,
          StoreSetting,
          PendingRegistration,
        ];

        // PostgreSQL (Supabase Direct Connection / Remote PostgreSQL)
        if (dbType === 'postgres' && databaseUrl && databaseUrl.trim().length > 0) {
          const isSupabaseOrRemote =
            databaseUrl.includes('supabase') ||
            databaseUrl.includes('render') ||
            databaseUrl.includes('sslmode=require');
          return {
            type: 'postgres',
            url: databaseUrl,
            entities,
            migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
            migrationsRun: true,
            synchronize: false,
            ssl: isSupabaseOrRemote ? { rejectUnauthorized: false } : false,
            extra: {
              max: config.get<string>('DB_POOL_MAX')
                ? parseInt(config.get<string>('DB_POOL_MAX')!, 10)
                : 4,
              min: 1,
              connectionTimeoutMillis: 10000,
              idleTimeoutMillis: 30000,
            },
          };
        }

        // SQLite local/offline fallback if DATABASE_URL is empty or DB_TYPE=sqlite
        return {
          type: 'sqlite',
          database: 'seed_herb_store.sqlite',
          entities,
          synchronize: false,
        };
      },
    }),
    SupabaseStorageModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    GrowthEngineModule,
    OrdersModule,
    PaymentsModule,
    ReviewsModule,
    ReportsModule,
    ChatModule,
    SettingsModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
