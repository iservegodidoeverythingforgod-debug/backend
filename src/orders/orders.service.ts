import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../database/entities/order.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { Payment } from '../database/entities/payment.entity';
import { Product } from '../database/entities/product.entity';
import { Review } from '../database/entities/review.entity';
import { OrderStatus, PaymentStatus } from '../common/enums';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(Review)
    private reviewRepository: Repository<Review>,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Order must contain at least one item');
    }

    let totalAmount = 0;
    const orderItems: Partial<OrderItem>[] = [];

    // Check products and stock
    for (const item of dto.items) {
      const prodId = item.productId || item.product_id;
      if (!prodId) {
        throw new BadRequestException('Product ID is required for each order item');
      }
      const product = await this.productRepository.findOne({
        where: { id: prodId },
      });

      if (!product) {
        throw new NotFoundException(`Product ${prodId} not found`);
      }

      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${product.name}". Available: ${product.stock}, requested: ${item.quantity}`,
        );
      }

      const subtotal = product.price * item.quantity;
      totalAmount += subtotal;

      // Decrement stock
      product.stock -= item.quantity;
      await this.productRepository.save(product);

      orderItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: item.quantity,
        unit_price: product.price,
        subtotal: Math.round(subtotal * 100) / 100,
      });
    }

    const orderNumber = `ORD-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const order = this.orderRepository.create({
      user_id: userId,
      order_number: orderNumber,
      total_amount: Math.round(totalAmount * 100) / 100,
      status: OrderStatus.PENDING_PAYMENT,
      shipping_name: dto.shipping_name || dto.shippingName || 'Customer',
      shipping_address: dto.shipping_address || dto.shippingAddress || 'Address',
      shipping_phone: dto.shipping_phone || dto.shippingPhone || '',
      notes: dto.notes,
    });

    const savedOrder = await this.orderRepository.save(order);

    // Save order items
    for (const item of orderItems) {
      const orderItem = this.orderItemRepository.create({
        ...item,
        order_id: savedOrder.id,
      });
      await this.orderItemRepository.save(orderItem);
    }

    // Create payment entry
    const payment = this.paymentRepository.create({
      order_id: savedOrder.id,
      amount: savedOrder.total_amount,
      payment_method: 'PROMPTPAY_QR',
      status: PaymentStatus.PENDING_SUBMISSION,
    });
    await this.paymentRepository.save(payment);

    return this.findOne(savedOrder.id);
  }

  async findAllForUser(userId: string) {
    const orders = await this.orderRepository.find({
      where: { user_id: userId },
      relations: ['items', 'payment', 'items.product'],
      order: { created_at: 'DESC' },
    });

    const reviews = await this.reviewRepository.find({
      where: { user_id: userId },
    });

    const reviewedOrderIds = new Set(reviews.map((r) => r.order_id).filter(Boolean));

    return orders.map((o) => ({
      ...o,
      is_reviewed: reviewedOrderIds.has(o.id),
    }));
  }

  async findAllForAdmin(status?: OrderStatus) {
    const qb = this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.items', 'items')
      .leftJoinAndSelect('order.payment', 'payment')
      .leftJoinAndSelect('order.user', 'user')
      .leftJoinAndSelect('items.product', 'product');

    if (status) {
      qb.andWhere('order.status = :status', { status });
    }

    qb.orderBy('order.created_at', 'DESC');
    return qb.getMany();
  }

  async findOne(id: string) {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['items', 'payment', 'user', 'items.product'],
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return order;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, adminId?: string) {
    const order = await this.findOne(id);
    const oldStatus = order.status;
    order.status = dto.status;
    const savedOrder = await this.orderRepository.save(order);

    // Synchronize payment status and audit trail
    if (order.payment) {
      let paymentUpdated = false;
      const payment = order.payment;

      if (dto.status === OrderStatus.PAID_CONFIRMED || dto.status === OrderStatus.SHIPPED || dto.status === OrderStatus.DELIVERED) {
        if (payment.status !== PaymentStatus.VERIFIED) {
          payment.status = PaymentStatus.VERIFIED;
          payment.verified_at = new Date();
          payment.verified_by = adminId || payment.verified_by;
          paymentUpdated = true;
        }
      } else if (dto.status === OrderStatus.CANCELLED) {
        if (payment.status !== PaymentStatus.REJECTED) {
          payment.status = PaymentStatus.REJECTED;
          payment.verified_at = new Date();
          payment.verified_by = adminId || payment.verified_by;
          paymentUpdated = true;
        }
      } else if (dto.status === OrderStatus.PENDING_PAYMENT) {
        if (payment.status !== PaymentStatus.PENDING_SUBMISSION) {
          payment.status = PaymentStatus.PENDING_SUBMISSION;
          paymentUpdated = true;
        }
      }

      if (dto.notes) {
        payment.notes = dto.notes;
        paymentUpdated = true;
      }

      if (paymentUpdated) {
        await this.paymentRepository.save(payment);
      }
    }

    return this.findOne(id);
  }
}

