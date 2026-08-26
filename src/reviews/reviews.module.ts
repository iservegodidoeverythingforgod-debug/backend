import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { Review } from '../database/entities/review.entity';
import { Product } from '../database/entities/product.entity';
import { Order } from '../database/entities/order.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Review, Product, Order])],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
