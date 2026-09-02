import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';
import { Order } from '../database/entities/order.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { Payment } from '../database/entities/payment.entity';
import { Product } from '../database/entities/product.entity';
import { Review } from '../database/entities/review.entity';
import { StoreSetting } from '../database/entities/store-setting.entity';
import { OrderStatus, PaymentStatus } from '../common/enums';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private brevoClient: BrevoClient | null = null;

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
    @InjectRepository(StoreSetting)
    private storeSettingRepository: Repository<StoreSetting>,
    private configService: ConfigService,
  ) {
    this.initializeBrevo();
  }

  private initializeBrevo() {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    if (apiKey && apiKey.trim().length > 0) {
      this.brevoClient = new BrevoClient({ apiKey: apiKey.trim() });
    }
  }

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

      // Calculate available stock on-the-fly (Physical stock - active reserved quantity)
      const reservedRaw = await this.orderItemRepository
        .createQueryBuilder('item')
        .innerJoin('item.order', 'order')
        .select('SUM(item.quantity)', 'reserved_qty')
        .where('item.product_id = :productId', { productId: prodId })
        .andWhere('order.status IN (:...activeStatuses)', {
          activeStatuses: [
            OrderStatus.PENDING_PAYMENT,
            OrderStatus.PAYMENT_SUBMITTED,
            OrderStatus.PAID_CONFIRMED,
            OrderStatus.SHIPPED,
          ],
        })
        .getRawOne();

      const reserved = Number(reservedRaw?.reserved_qty || 0);
      const availableStock = Math.max(0, product.stock - reserved);

      if (availableStock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${product.name}". Available: ${availableStock}, requested: ${item.quantity}`,
        );
      }

      const subtotal = product.price * item.quantity;
      totalAmount += subtotal;

      // Note: Stock is not deducted on order creation.
      // It is deducted only when the order status reaches DELIVERED.

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

    const orderIds = orders.map((o) => o.id);
    if (orderIds.length === 0) return [];

    const reviews = await this.reviewRepository
      .createQueryBuilder('r')
      .where('r.order_id IN (:...orderIds)', { orderIds })
      .getMany();

    const reviewedKeySet = new Set(
      reviews.map((r) => `${r.order_id}_${r.product_id}`),
    );

    return orders.map((order) => {
      const itemsWithReviewed = (order.items || []).map((item) => ({
        ...item,
        is_reviewed: reviewedKeySet.has(`${order.id}_${item.product_id}`),
      }));
      const isFullyReviewed =
        itemsWithReviewed.length > 0 &&
        itemsWithReviewed.every((item) => item.is_reviewed);

      return {
        ...order,
        items: itemsWithReviewed,
        is_reviewed: isFullyReviewed,
        is_fully_reviewed: isFullyReviewed,
      };
    });
  }

  async findAllForAdmin(status?: OrderStatus) {
    const where = status ? { status } : {};
    const orders = await this.orderRepository.find({
      where,
      relations: ['items', 'payment', 'user', 'items.product'],
      order: { created_at: 'DESC' },
    });

    return orders;
  }

  async findOne(id: string) {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['items', 'payment', 'user', 'items.product'],
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const reviews = await this.reviewRepository.find({
      where: { order_id: id },
    });

    const reviewedProductIds = new Set(reviews.map((r) => r.product_id));

    const itemsWithReviewed = (order.items || []).map((item) => ({
      ...item,
      is_reviewed: reviewedProductIds.has(item.product_id),
    }));

    const isFullyReviewed =
      itemsWithReviewed.length > 0 &&
      itemsWithReviewed.every((item) => item.is_reviewed);

    return {
      ...order,
      items: itemsWithReviewed,
      is_reviewed: isFullyReviewed,
      is_fully_reviewed: isFullyReviewed,
    };
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto, adminId?: string) {
    const order = await this.findOne(id);
    const oldStatus = order.status;

    // Terminal state check: Once delivered, order status cannot be changed
    if (oldStatus === OrderStatus.DELIVERED) {
      if (dto.status !== OrderStatus.DELIVERED) {
        throw new BadRequestException('Cannot change status of a delivered order as it is completed and finalized');
      }
      return order;
    }

    order.status = dto.status;
    const savedOrder = await this.orderRepository.save(order);

    // Deduct stock ONLY when order status becomes DELIVERED
    if (dto.status === OrderStatus.DELIVERED) {
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          const product = await this.productRepository.findOne({
            where: { id: item.product_id },
          });
          if (product) {
            product.stock = Math.max(0, product.stock - item.quantity);
            await this.productRepository.save(product);
          }
        }
      }
    }

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

  /**
   * Dynamically generate receipt data for an order
   */
  async getReceipt(orderId: string, currentUser?: { id: string; role: string }) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['items', 'payment', 'user', 'items.product'],
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (currentUser && currentUser.role !== 'admin' && order.user_id !== currentUser.id) {
      throw new ForbiddenException('You are not authorized to view the receipt for this order');
    }

    const paidStatuses = [OrderStatus.PAID_CONFIRMED, OrderStatus.SHIPPED, OrderStatus.DELIVERED];
    if (!paidStatuses.includes(order.status as OrderStatus)) {
      throw new BadRequestException('Receipt is only available for paid and confirmed orders.');
    }

    const settings = await this.storeSettingRepository.find({
      order: { created_at: 'ASC' },
      take: 1,
    });
    const setting = settings.length > 0 ? settings[0] : null;

    const subtotal = Number(order.total_amount);
    const formattedDate = order.created_at ? new Date(order.created_at).toLocaleString('th-TH') : '';
    const paidDate = order.payment?.verified_at ? new Date(order.payment.verified_at).toLocaleString('th-TH') : formattedDate;

    return {
      receiptNumber: `RCP-${order.order_number}`,
      orderId: order.id,
      orderNumber: order.order_number,
      issuedAt: new Date().toISOString(),
      orderDate: order.created_at,
      orderStatus: order.status,
      paidAt: order.payment?.verified_at || order.updated_at,
      paidDateDisplay: paidDate,
      paymentMethod: order.payment?.payment_method || 'PROMPTPAY_QR',
      paymentStatus: order.payment?.status || 'VERIFIED',
      merchant: {
        storeName: setting?.account_name || 'Organic Seed & Herb Store Co., Ltd.',
        promptpayId: setting?.promptpay_id || '0812345678',
        promptpayType: setting?.promptpay_type || 'PHONE',
        address: '123 ถนนพฤกษชาติ แขวงบางเขน เขตหลักสี่ กรุงเทพมหานคร 10210',
        taxId: '0105567001234',
        contactEmail: 'contact@seedstore.com',
      },
      customer: {
        name: order.shipping_name,
        address: order.shipping_address,
        phone: order.shipping_phone,
        email: order.user?.email || null,
        userId: order.user_id,
      },
      items: (order.items || []).map((item, idx) => ({
        index: idx + 1,
        productId: item.product_id,
        productName: item.product_name,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        subtotal: Number(item.subtotal),
      })),
      summary: {
        subtotal: subtotal,
        shippingFee: 0.00,
        discount: 0.00,
        totalAmount: subtotal,
        formattedTotal: `฿${subtotal.toFixed(2)}`,
      },
      notes: order.notes,
      verifiedBy: order.payment?.verified_by || 'Admin Store',
    };
  }

  /**
   * Admin approves & sends official digital receipt to customer email
   */
  async sendReceipt(orderId: string, adminId: string, customEmail?: string) {
    const receipt = await this.getReceipt(orderId);
    const targetEmail = (customEmail || receipt.customer.email || '').trim();

    if (!targetEmail) {
      throw new BadRequestException('No recipient customer email found for this order.');
    }

    const itemsHtml = receipt.items
      .map(
        (i) => `
        <tr>
          <td style="padding: 10px 8px; border-bottom: 1px solid #E2E8F0; font-size: 13px; color: #2D3748;">
            ${i.index}. ${i.productName}
          </td>
          <td style="padding: 10px 8px; border-bottom: 1px solid #E2E8F0; font-size: 13px; text-align: center; color: #2D3748;">
            ${i.quantity}
          </td>
          <td style="padding: 10px 8px; border-bottom: 1px solid #E2E8F0; font-size: 13px; text-align: right; color: #2D3748;">
            ฿${i.unitPrice.toFixed(2)}
          </td>
          <td style="padding: 10px 8px; border-bottom: 1px solid #E2E8F0; font-size: 13px; text-align: right; font-weight: 600; color: #2D5A27;">
            ฿${i.subtotal.toFixed(2)}
          </td>
        </tr>`,
      )
      .join('');

    const htmlContent = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background-color: #FAFAF7; border-radius: 16px; border: 1px solid #EAEAE4;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #2D5A27; margin: 0; font-size: 22px;">🌿 ${receipt.merchant.storeName}</h2>
          <p style="color: #718096; font-size: 13px; margin: 4px 0 0;">ใบเสร็จรับเงินอิเล็กทรอนิกส์ (Official Electronic Receipt)</p>
        </div>

        <div style="background-color: #FFFFFF; padding: 24px; border-radius: 12px; border: 1px solid #E2E8F0; margin-bottom: 20px;">
          <div style="display: flex; justify-content: space-between; border-bottom: 2px dashed #E2E8F0; padding-bottom: 14px; margin-bottom: 16px;">
            <div>
              <div style="font-size: 12px; color: #718096;">เลขที่ใบเสร็จ (Receipt No.)</div>
              <div style="font-size: 15px; font-weight: 700; color: #2D5A27;">${receipt.receiptNumber}</div>
              <div style="font-size: 12px; color: #718096; margin-top: 4px;">เลขที่คำสั่งซื้อ: ${receipt.orderNumber}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 12px; color: #718096;">วันที่ชำระเงิน</div>
              <div style="font-size: 13px; font-weight: 600; color: #2D3748;">${receipt.paidDateDisplay}</div>
              <div style="display: inline-block; background-color: #E8F5E9; color: #2D5A27; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px; margin-top: 4px;">
                ✓ ยืนยันการชำระเงินแล้ว
              </div>
            </div>
          </div>

          <div style="margin-bottom: 18px; font-size: 13px; line-height: 1.5; color: #4A5568;">
            <strong>ผู้ซื้อ:</strong> ${receipt.customer.name} (${receipt.customer.phone})<br/>
            <strong>ที่อยู่จัดส่ง:</strong> ${receipt.customer.address}
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
            <thead>
              <tr style="background-color: #F7FAFC;">
                <th style="padding: 8px; font-size: 12px; text-align: left; color: #4A5568; border-bottom: 1px solid #CBD5E0;">รายการ</th>
                <th style="padding: 8px; font-size: 12px; text-align: center; color: #4A5568; border-bottom: 1px solid #CBD5E0;">จำนวน</th>
                <th style="padding: 8px; font-size: 12px; text-align: right; color: #4A5568; border-bottom: 1px solid #CBD5E0;">ราคาต่อหน่วย</th>
                <th style="padding: 8px; font-size: 12px; text-align: right; color: #4A5568; border-bottom: 1px solid #CBD5E0;">รวม</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div style="border-top: 1px solid #E2E8F0; padding-top: 12px; text-align: right;">
            <div style="font-size: 13px; color: #718096; margin-bottom: 4px;">ค่าจัดส่ง: ฿0.00</div>
            <div style="font-size: 18px; font-weight: 800; color: #2D5A27;">
              ยอดรวมสุทธิ: ${receipt.summary.formattedTotal}
            </div>
          </div>
        </div>

        <div style="text-align: center; color: #A0AEC0; font-size: 11px;">
          ขอบคุณที่ไว้วางใจสั่งซื้อเมล็ดพันธุ์และสมุนไพรออร์แกนิกกับเรา 🌿<br/>
          เอกสารนี้ออกโดยระบบอัตโนมัติของร้านค้า และได้รับการอนุมัติจากแอดมินแล้ว
        </div>
      </div>
    `;

    const senderEmail = this.configService.get<string>('BREVO_SENDER_EMAIL', 'noreply@seedstore.com');
    const senderName = this.configService.get<string>('BREVO_SENDER_NAME', 'Seed & Herb Store');

    if (this.brevoClient) {
      try {
        await this.brevoClient.transactionalEmails.sendTransacEmail({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: targetEmail }],
          subject: `ใบเสร็จรับเงินสำหรับคำสั่งซื้อ #${receipt.orderNumber} - Seed & Herb Store`,
          htmlContent,
        });
        this.logger.log(`Receipt email sent via Brevo to ${targetEmail} for order ${orderId}`);
      } catch (err: any) {
        this.logger.error(`Failed to send receipt email via Brevo to ${targetEmail}: ${err.message || err}`);
      }
    } else {
      this.logger.log(`[DEV MODE - NO BREVO KEY] Receipt for order ${orderId} sent to ${targetEmail}`);
    }

    return {
      success: true,
      message: `ใบเสร็จรับเงินถูกส่งไปยัง ${targetEmail} สำเร็จเรียบร้อยแล้ว`,
      receipt,
    };
  }
}

