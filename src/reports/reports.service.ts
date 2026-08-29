import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../database/entities/order.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { Product } from '../database/entities/product.entity';
import { User } from '../database/entities/user.entity';
import { Review } from '../database/entities/review.entity';
import { OrderStatus, PaymentStatus, Role } from '../common/enums';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Review)
    private reviewRepository: Repository<Review>,
  ) {}

  /**
   * Executive Dashboard Overview Metrics
   */
  async getDashboardSummary() {
    const totalRevenueResult = await this.orderRepository
      .createQueryBuilder('order')
      .select('SUM(order.total_amount)', 'sum')
      .where('order.status IN (:...statuses)', {
        statuses: [OrderStatus.PAID_CONFIRMED, OrderStatus.SHIPPED, OrderStatus.DELIVERED],
      })
      .getRawOne();

    const totalRevenue = parseFloat(totalRevenueResult?.sum || '0');
    const totalOrders = await this.orderRepository.count();
    const pendingVerification = await this.orderRepository.count({
      where: { status: OrderStatus.PAYMENT_SUBMITTED },
    });
    const totalProducts = await this.productRepository.count({
      where: { is_active: true },
    });
    const totalCustomers = await this.userRepository.count({
      where: { role: Role.CUSTOMER },
    });
    const lowStockCount = await this.productRepository
      .createQueryBuilder('product')
      .where('product.stock <= :threshold', { threshold: 10 })
      .getCount();

    return {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalOrders,
      pendingVerificationOrders: pendingVerification,
      totalActiveProducts: totalProducts,
      totalCustomers,
      lowStockAlerts: lowStockCount,
    };
  }

  /**
   * Top-Selling Seed & Herb Products
   */
  async getTopProducts(limit = 5) {
    const topItems = await this.orderItemRepository
      .createQueryBuilder('item')
      .select('item.product_id', 'productId')
      .addSelect('item.product_name', 'productName')
      .addSelect('SUM(item.quantity)', 'totalSold')
      .addSelect('SUM(item.subtotal)', 'totalRevenue')
      .groupBy('item.product_id')
      .addGroupBy('item.product_name')
      .orderBy('SUM(item.quantity)', 'DESC')
      .limit(limit)
      .getRawMany();

    return topItems.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      totalSold: parseInt(item.totalSold, 10),
      totalRevenue: parseFloat(item.totalRevenue),
    }));
  }

  /**
   * Customer Satisfaction & Review Analysis
   */
  async getCustomerSatisfaction() {
    const stats = await this.reviewRepository
      .createQueryBuilder('r')
      .select('COUNT(r.id)', 'total')
      .addSelect('AVG(r.rating)', 'avg')
      .getRawOne();

    const totalReviews = parseInt(stats?.total || '0', 10);

    if (totalReviews === 0) {
      return {
        totalReviews: 0,
        total_reviews: 0,
        averageRating: 5.0,
        average_rating: 5.0,
        ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        rating_distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
        satisfactionPercentage: 100,
        satisfaction_percentage: 100,
      };
    }

    const averageRating = Math.round(parseFloat(stats?.avg || '5') * 10) / 10;

    const distributionRaw = await this.reviewRepository
      .createQueryBuilder('r')
      .select('r.rating', 'rating')
      .addSelect('COUNT(r.id)', 'count')
      .groupBy('r.rating')
      .getRawMany();

    const distribution: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    distributionRaw.forEach((row) => {
      const rating = parseInt(row.rating, 10);
      if (distribution[rating] !== undefined) {
        distribution[rating] = parseInt(row.count, 10);
      }
    });

    const positiveReviews = (distribution[5] || 0) + (distribution[4] || 0);
    const satisfactionPercentage = Math.round((positiveReviews / totalReviews) * 100);

    return {
      totalReviews,
      total_reviews: totalReviews,
      averageRating,
      average_rating: averageRating,
      ratingDistribution: distribution,
      rating_distribution: distribution,
      satisfactionPercentage,
      satisfaction_percentage: satisfactionPercentage,
    };
  }

  /**
   * Inventory & Stock Alerts
   */
  async getInventoryAlerts(threshold = 15) {
    return this.productRepository
      .createQueryBuilder('product')
      .where('product.stock <= :threshold', { threshold })
      .orderBy('product.stock', 'ASC')
      .getMany();
  }
}
