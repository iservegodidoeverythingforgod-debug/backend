import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { Order } from '../database/entities/order.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { Product } from '../database/entities/product.entity';
import { User } from '../database/entities/user.entity';
import { Review } from '../database/entities/review.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Product, User, Review]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
