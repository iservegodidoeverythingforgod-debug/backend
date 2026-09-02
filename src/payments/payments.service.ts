import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../database/entities/payment.entity';
import { Order } from '../database/entities/order.entity';
import { Product } from '../database/entities/product.entity';
import { StoreSetting, PromptPayType } from '../database/entities/store-setting.entity';
import { PaymentStatus, OrderStatus } from '../common/enums';
import { VerifyPaymentDto } from './dto';
import { generatePromptPayPayload } from './promptpay-qr.util';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(StoreSetting)
    private storeSettingRepository: Repository<StoreSetting>,
  ) {}

  /**
   * Upload payment slip for an order
   */
  async submitSlip(orderId: string, slipImageUrl: string, userId: string) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['payment'],
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    if (order.user_id !== userId) {
      throw new BadRequestException('You are not authorized to update payment for this order');
    }

    let payment = order.payment;
    if (!payment) {
      payment = this.paymentRepository.create({
        order_id: order.id,
        amount: order.total_amount,
        payment_method: 'PROMPTPAY_QR',
      });
    }

    payment.slip_image_url = slipImageUrl;
    payment.status = PaymentStatus.PENDING_VERIFICATION;
    await this.paymentRepository.save(payment);

    order.status = OrderStatus.PAYMENT_SUBMITTED;
    await this.orderRepository.save(order);

    return payment;
  }

  /**
   * Admin verifies or rejects the payment slip
   */
  async verifyPayment(paymentId: string, adminId: string, dto: VerifyPaymentDto) {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId },
      relations: ['order', 'order.items'],
    });

    if (!payment) {
      throw new NotFoundException(`Payment with ID ${paymentId} not found`);
    }

    payment.status = dto.status;
    payment.notes = dto.notes;
    payment.verified_at = new Date();
    payment.verified_by = adminId;
    await this.paymentRepository.save(payment);

    const order = payment.order;
    if (order) {
      if (dto.status === PaymentStatus.VERIFIED) {
        order.status = OrderStatus.PAID_CONFIRMED;
        // Note: Inventory stock is deducted only when the order status reaches DELIVERED.
      } else if (dto.status === PaymentStatus.REJECTED) {
        order.status = OrderStatus.PENDING_PAYMENT;
      }
      await this.orderRepository.save(order);
    }

    return payment;
  }

  /**
   * Get PromptPay / QR Code Payment details for an order dynamically generated
   * from the database store settings and exact order amount.
   */
  async getPaymentDetails(orderId: string) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['payment'],
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    // Fetch stored merchant PromptPay configuration from database
    const settings = await this.storeSettingRepository.find({
      order: { created_at: 'ASC' },
      take: 1,
    });
    let setting = settings.length > 0 ? settings[0] : null;

    if (!setting) {
      setting = {
        id: 'default',
        promptpay_id: '0812345678',
        promptpay_type: PromptPayType.PHONE,
        account_name: 'Organic Seed & Herb Store Co., Ltd.',
        created_at: new Date(),
        updated_at: new Date(),
        updated_by: null,
      } as StoreSetting;
    }

    const amount = Number(order.total_amount);

    // Generate real EMVCo PromptPay Dynamic QR Payload with the stored merchant ID and exact order amount
    const qrPayload = generatePromptPayPayload(
      setting.promptpay_id,
      setting.promptpay_type,
      amount,
    );

    return {
      orderId: order.id,
      order_id: order.id,
      orderNumber: order.order_number,
      order_number: order.order_number,
      totalAmount: order.total_amount,
      total_amount: order.total_amount,
      amount: order.total_amount,
      amount_thb: amount,
      paymentMethod: 'PROMPTPAY_QR',
      payment_method: 'PROMPTPAY_QR',
      accountName: setting.account_name,
      account_name: setting.account_name,
      promptPayNumber: setting.promptpay_id,
      promptpay_id: setting.promptpay_id,
      promptpay_type: setting.promptpay_type,
      qrPayload,
      qr_payload: qrPayload,
      payment: order.payment,
    };
  }
}
