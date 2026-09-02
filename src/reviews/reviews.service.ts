import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Review } from '../database/entities/review.entity';
import { Product } from '../database/entities/product.entity';
import { Order } from '../database/entities/order.entity';
import { CreateReviewDto } from './dto';
import { BulkDeleteResult, FailedItem } from '../common/dto/bulk-delete.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private reviewRepository: Repository<Review>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
  ) {}

  async create(userId: string, dto: CreateReviewDto) {
    const rawOrderId = (dto.orderId || dto.order_id || '').trim();
    const rawProdId = (dto.productId || dto.product_id || '').trim();
    let product: Product | null = null;
    let finalOrderId: string | null = null;

    // 1. If an orderId is provided, validate order and enforce single review per order
    if (rawOrderId.length > 0) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawOrderId);
      if (isUuid) {
        const order = await this.orderRepository.findOne({
          where: { id: rawOrderId },
          relations: ['items'],
        });

        if (order) {
          finalOrderId = order.id;

          // Check if customer already submitted a review for this order
          const existingOrderReview = await this.reviewRepository.findOne({
            where: { order_id: finalOrderId, user_id: userId },
          });

          if (existingOrderReview) {
            throw new ConflictException('You have already submitted a review for this order.');
          }

          // If product wasn't explicitly matched, try extracting from order items
          if (!product && order.items && order.items.length > 0) {
            const matchedItem = order.items.find((i) => i.product_id === rawProdId) || order.items[0];
            if (matchedItem && matchedItem.product_id) {
              product = await this.productRepository.findOne({
                where: { id: matchedItem.product_id },
              });
            }
          }
        }
      }
    }

    // 2. Try finding product by ID if provided and not yet found
    if (!product && rawProdId.length > 0) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawProdId);
      if (isUuid) {
        product = await this.productRepository.findOne({
          where: { id: rawProdId },
        });
      }
    }

    // 3. Fallback: Search by product name if ID didn't match
    if (!product) {
      const prodName = (dto.productName || dto.product_name || rawProdId).trim();
      if (prodName.length > 0) {
        product = await this.productRepository.findOne({
          where: { name: prodName },
        });

        if (!product) {
          product = await this.productRepository
            .createQueryBuilder('p')
            .where('p.name ILIKE :name', { name: `%${prodName}%` })
            .getOne();
        }
      }
    }

    // 4. Fallback: If still not found, link to the first active product
    if (!product) {
      product = await this.productRepository.findOne({
        where: { is_active: true },
      });
    }

    if (!product) {
      throw new NotFoundException('No botanical product found to associate with this review');
    }

    const finalProductId = product.id;

    // Check if user already reviewed without order_id
    if (!finalOrderId) {
      const existing = await this.reviewRepository.findOne({
        where: { product_id: finalProductId, user_id: userId },
      });

      if (existing) {
        existing.rating = Number(dto.rating) || 5;
        existing.comment = dto.comment;
        return this.reviewRepository.save(existing);
      }
    }

    const review = this.reviewRepository.create({
      order_id: finalOrderId,
      product_id: finalProductId,
      user_id: userId,
      rating: Number(dto.rating) || 5,
      comment: dto.comment,
    });

    return this.reviewRepository.save(review);
  }

  async findByProduct(productId: string) {
    return this.reviewRepository.find({
      where: { product_id: productId },
      relations: ['user'],
      order: { created_at: 'DESC' },
    });
  }

  async findAll() {
    return this.reviewRepository.find({
      relations: ['user', 'product'],
      order: { created_at: 'DESC' },
    });
  }

  async findAllForAdmin() {
    return this.reviewRepository.find({
      relations: ['user', 'product'],
      order: { created_at: 'ASC' },
    });
  }

  async remove(id: string) {
    const review = await this.reviewRepository.findOne({ where: { id } });
    if (!review) {
      throw new NotFoundException(`Review with ID ${id} not found`);
    }
    await this.reviewRepository.delete(id);
    return { success: true, message: 'Review deleted successfully' };
  }

  async bulkRemove(ids: string[], adminId: string): Promise<BulkDeleteResult> {
    const succeededIds: string[] = [];
    const failedItems: FailedItem[] = [];

    await this.reviewRepository.manager.transaction(async (manager) => {
      const existingReviews = await manager.find(Review, {
        where: { id: In(ids) },
      });

      const foundMap = new Map(existingReviews.map((r) => [r.id, r]));

      for (const id of ids) {
        const review = foundMap.get(id);
        if (!review) {
          failedItems.push({ id, reason: `Review with ID ${id} not found` });
          continue;
        }

        try {
          await manager.delete(Review, { id });
          succeededIds.push(id);
        } catch (err) {
          failedItems.push({
            id,
            reason: err instanceof Error ? err.message : 'Database error during review deletion',
          });
        }
      }
    });

    return {
      totalRequested: ids.length,
      succeededCount: succeededIds.length,
      failedCount: failedItems.length,
      succeededIds,
      failedItems,
      action: 'BULK_DELETE_REVIEWS',
    };
  }
}
