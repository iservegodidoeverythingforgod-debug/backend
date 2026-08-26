import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Payment } from '../database/entities/payment.entity';
import { Order } from '../database/entities/order.entity';
import { Product } from '../database/entities/product.entity';
import { StoreSetting } from '../database/entities/store-setting.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Order, Product, StoreSetting])],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
