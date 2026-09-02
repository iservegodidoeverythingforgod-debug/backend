import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order } from '../database/entities/order.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { Payment } from '../database/entities/payment.entity';
import { Product } from '../database/entities/product.entity';
import { Review } from '../database/entities/review.entity';
import { StoreSetting } from '../database/entities/store-setting.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderItem, Payment, Product, Review, StoreSetting])],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
