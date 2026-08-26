import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
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
  AnimationAsset,
  StoreSetting,
} from './entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
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
      AnimationAsset,
      StoreSetting,
    ]),
  ],
  providers: [SeedService],
  exports: [SeedService],
})
export class DatabaseModule {}
