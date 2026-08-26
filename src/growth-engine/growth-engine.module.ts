import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GrowthRule } from '../database/entities/growth-rule.entity';
import { GrowthStage } from '../database/entities/growth-stage.entity';
import { GrowthCondition } from '../database/entities/growth-condition.entity';
import { Product } from '../database/entities/product.entity';
import { AnimationAsset } from '../database/entities/animation-asset.entity';
import { GrowthEngineService } from './growth-engine.service';
import { GrowthEngineController } from './growth-engine.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GrowthRule,
      GrowthStage,
      GrowthCondition,
      Product,
      AnimationAsset,
    ]),
  ],
  controllers: [GrowthEngineController],
  providers: [GrowthEngineService],
  exports: [GrowthEngineService],
})
export class GrowthEngineModule {}
