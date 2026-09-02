import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Product } from '../database/entities/product.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { OrderStatus } from '../common/enums';
import { CreateProductDto, UpdateProductDto } from './dto';
import { StorageCleanupService } from '../common/storage/storage-cleanup.service';
import { BulkDeleteResult, FailedItem } from '../common/dto/bulk-delete.dto';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(OrderItem)
    private orderItemRepository: Repository<OrderItem>,
    private readonly storageCleanupService: StorageCleanupService,
  ) {}

  private async calculateReservedQuantities(productIds?: string[]): Promise<Map<string, number>> {
    try {
      const qb = this.orderItemRepository
        .createQueryBuilder('item')
        .innerJoin('item.order', 'order')
        .select('item.product_id', 'product_id')
        .addSelect('SUM(item.quantity)', 'reserved_qty')
        .where('order.status IN (:...activeStatuses)', {
          activeStatuses: [
            OrderStatus.PENDING_PAYMENT,
            OrderStatus.PAYMENT_SUBMITTED,
            OrderStatus.PAID_CONFIRMED,
            OrderStatus.SHIPPED,
          ],
        })
        .groupBy('item.product_id');

      if (productIds && productIds.length > 0) {
        qb.andWhere('item.product_id IN (:...productIds)', { productIds });
      }

      const raw = await qb.getRawMany();
      const map = new Map<string, number>();
      for (const r of raw) {
        if (r.product_id) {
          map.set(r.product_id, Number(r.reserved_qty) || 0);
        }
      }
      return map;
    } catch (err: any) {
      this.logger.error(`Error calculating reserved quantities: ${err?.message}`);
      return new Map<string, number>();
    }
  }

  async findAll(params?: {
    categoryId?: string;
    search?: string;
    difficulty?: string;
    includeInactive?: boolean;
    sortBy?: string;
    order?: 'ASC' | 'DESC';
    page?: number;
    limit?: number;
  }) {
    const qb = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.growth_rule', 'growth_rule')
      .leftJoinAndSelect('growth_rule.stages', 'growth_rule_stages')
      .leftJoinAndSelect('growth_rule_stages.conditions', 'growth_rule_conditions')
      .leftJoinAndSelect('growth_rule_stages.animation_asset', 'growth_rule_animation_asset');

    if (!params?.includeInactive) {
      qb.andWhere('product.is_active = :active', { active: true });
    }

    if (
      params?.categoryId &&
      params.categoryId.trim() !== '' &&
      params.categoryId !== 'null' &&
      params.categoryId !== 'ALL'
    ) {
      const catFilter = params.categoryId.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(catFilter);
      if (isUuid) {
        qb.andWhere('(product.category_id = :catFilter OR category.id = :catFilter)', { catFilter });
      } else {
        qb.andWhere('LOWER(category.name) = LOWER(:catFilter)', { catFilter });
      }
    }

    if (params?.difficulty) {
      qb.andWhere('product.difficulty = :difficulty', {
        difficulty: params.difficulty,
      });
    }

    if (params?.search) {
      qb.andWhere(
        '(LOWER(product.name) LIKE :search OR LOWER(product.scientific_name) LIKE :search OR LOWER(product.description) LIKE :search)',
        { search: `%${params.search.toLowerCase()}%` },
      );
    }

    const sortField = params?.sortBy || 'created_at';
    const sortOrder = params?.order || 'DESC';

    if (['price', 'name', 'stock', 'harvest_days', 'germination_days', 'created_at'].includes(sortField)) {
      qb.orderBy(`product.${sortField}`, sortOrder);
    } else if (sortField === 'createdAt') {
      qb.orderBy('product.created_at', sortOrder);
    } else {
      qb.orderBy('product.created_at', 'DESC');
    }

    if (typeof qb.addOrderBy === 'function') {
      qb.addOrderBy('growth_rule_stages.stage_order', 'ASC');
      qb.addOrderBy('growth_rule_conditions.condition_order', 'ASC');
    }

    if (params?.page !== undefined || params?.limit !== undefined) {
      const page = Math.max(1, params?.page || 1);
      const limit = Math.max(1, params?.limit || 12);
      const skip = (page - 1) * limit;

      const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();
      const productIds = data.map((p) => p.id);
      const reservedMap = await this.calculateReservedQuantities(productIds);

      const items = data.map((product) => {
        const reserved = reservedMap.get(product.id) || 0;
        const availableStock = Math.max(0, product.stock - reserved);
        return {
          ...product,
          physical_stock: product.stock,
          reserved_stock: reserved,
          available_stock: availableStock,
          stock: availableStock,
        };
      });

      return {
        data: items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    }

    const products = await qb.getMany();
    const productIds = products.map((p) => p.id);
    const reservedMap = await this.calculateReservedQuantities(productIds);

    return products.map((product) => {
      const reserved = reservedMap.get(product.id) || 0;
      const availableStock = Math.max(0, product.stock - reserved);
      return {
        ...product,
        physical_stock: product.stock,
        reserved_stock: reserved,
        available_stock: availableStock,
        stock: availableStock,
      };
    });
  }

  async findOne(id: string) {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: [
        'category',
        'growth_rule',
        'growth_rule.stages',
        'growth_rule.stages.conditions',
        'growth_rule.stages.animation_asset',
        'reviews',
        'reviews.user',
      ],
      order: {
        growth_rule: {
          stages: {
            stage_order: 'ASC',
            conditions: {
              condition_order: 'ASC',
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    const reservedMap = await this.calculateReservedQuantities([product.id]);
    const reserved = reservedMap.get(product.id) || 0;
    const availableStock = Math.max(0, product.stock - reserved);

    return {
      ...product,
      physical_stock: product.stock,
      reserved_stock: reserved,
      available_stock: availableStock,
      stock: availableStock,
    };
  }

  async create(dto: CreateProductDto) {
    if (dto.price !== undefined && Number(dto.price) < 0) {
      throw new BadRequestException('Price cannot be negative');
    }
    if (dto.harvest_days !== undefined && Number(dto.harvest_days) <= 0) {
      throw new BadRequestException('Harvest days must be greater than 0');
    }
    if (dto.germination_days !== undefined && Number(dto.germination_days) <= 0) {
      throw new BadRequestException('Germination days must be greater than 0');
    }

    const product = this.productRepository.create({
      ...dto,
      germination_days: dto.germination_days ?? 7,
    });
    return this.productRepository.save(product);
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.findOne(id);

    if (dto.price !== undefined && Number(dto.price) < 0) {
      throw new BadRequestException('Price cannot be negative');
    }
    if (dto.harvest_days !== undefined && Number(dto.harvest_days) <= 0) {
      throw new BadRequestException('Harvest days must be greater than 0');
    }
    if (dto.germination_days !== undefined && Number(dto.germination_days) <= 0) {
      throw new BadRequestException('Germination days must be greater than 0');
    }

    // Clean up old thumbnail if changed
    if (dto.image_url && product.image_url && dto.image_url !== product.image_url) {
      this.storageCleanupService.deleteFileByUrl(product.image_url);
    }

    // Explicitly synchronize relation foreign keys so TypeORM does not revert to old relations
    if ('category_id' in dto) {
      product.category_id = dto.category_id ? dto.category_id.trim() : (null as any);
      product.category = null as any;
    }

    if ('rule_id' in dto) {
      product.rule_id = dto.rule_id ? dto.rule_id.trim() : (null as any);
      product.growth_rule = null as any;
    }

    Object.assign(product, dto);
    await this.productRepository.save(product);
    return this.findOne(id);
  }

  async updateStock(id: string, delta: number) {
    const product = await this.findOne(id);
    product.stock = Math.max(0, product.stock + delta);
    return this.productRepository.save(product);
  }

  async addGalleryImage(id: string, imageUrl: string) {
    const product = await this.findOne(id);
    if (!product.images) {
      product.images = [];
    }
    product.images.push(imageUrl);
    return this.productRepository.save(product);
  }

  async removeGalleryImage(id: string, imageUrl: string) {
    const product = await this.findOne(id);
    if (product.images && product.images.length > 0) {
      product.images = product.images.filter((img) => img !== imageUrl);
      await this.productRepository.save(product);
      // Non-blocking storage cleanup
      await this.storageCleanupService.deleteFileByUrl(imageUrl);
    }
    return {
      success: true,
      images: product.images || [],
    };
  }

  async remove(id: string) {
    const product = await this.findOne(id);
    const filesToClean: string[] = [];

    if (product.image_url) filesToClean.push(product.image_url);
    if (Array.isArray(product.images)) filesToClean.push(...product.images);

    await this.productRepository.delete(id);

    // Clean up associated files in storage
    if (filesToClean.length > 0) {
      await this.storageCleanupService.deleteFilesByUrls(filesToClean);
    }

    return {
      success: true,
      action: 'deleted',
      message: `Product '${product.name}' deleted successfully`,
    };
  }

  /**
   * Bulk deletion of products inside a database transaction.
   * Cleans up all referenced cover and gallery images in Supabase Storage.
   */
  async bulkRemove(ids: string[], adminId: string): Promise<BulkDeleteResult> {
    const succeededIds: string[] = [];
    const failedItems: FailedItem[] = [];
    const filesToClean: string[] = [];

    // Run within transactional manager
    await this.productRepository.manager.transaction(async (manager) => {
      const existingProducts = await manager.find(Product, {
        where: { id: In(ids) },
      });

      const foundMap = new Map(existingProducts.map((p) => [p.id, p]));

      for (const id of ids) {
        const product = foundMap.get(id);
        if (!product) {
          failedItems.push({ id, reason: `Product with ID ${id} not found` });
          continue;
        }

        try {
          if (product.image_url) filesToClean.push(product.image_url);
          if (Array.isArray(product.images)) filesToClean.push(...product.images);

          await manager.delete(Product, { id });
          succeededIds.push(id);
        } catch (err) {
          failedItems.push({
            id,
            reason: err instanceof Error ? err.message : 'Database error during deletion',
          });
        }
      }
    });

    // Non-blocking storage cleanup after successful DB commit
    if (filesToClean.length > 0) {
      this.storageCleanupService.deleteFilesByUrls(filesToClean).catch((err) => {
        this.logger.warn(`Storage cleanup failed for bulk deleted products: ${err}`);
      });
    }

    return {
      totalRequested: ids.length,
      succeededCount: succeededIds.length,
      failedCount: failedItems.length,
      succeededIds,
      failedItems,
      action: 'BULK_DELETE_PRODUCTS',
    };
  }
}
