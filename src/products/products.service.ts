import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Product } from '../database/entities/product.entity';
import { CreateProductDto, UpdateProductDto } from './dto';
import { StorageCleanupService } from '../common/storage/storage-cleanup.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { BulkDeleteResult, FailedItem } from '../common/dto/bulk-delete.dto';
import { AuditStatus } from '../database/entities/audit-log.entity';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    private readonly storageCleanupService: StorageCleanupService,
    private readonly auditLogService: AuditLogService,
  ) {}

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
      .leftJoinAndSelect('product.reviews', 'reviews')
      .leftJoinAndSelect('reviews.user', 'reviewUser');

    if (!params?.includeInactive) {
      qb.andWhere('product.is_active = :active', { active: true });
    }

    if (params?.categoryId) {
      qb.andWhere('product.category_id = :categoryId', {
        categoryId: params.categoryId,
      });
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
    } else {
      qb.orderBy('product.created_at', 'DESC');
    }

    if (params?.page !== undefined || params?.limit !== undefined) {
      const page = Math.max(1, params?.page || 1);
      const limit = Math.max(1, params?.limit || 12);
      const skip = (page - 1) * limit;

      const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

      return {
        data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      };
    }

    return qb.getMany();
  }

  async findOne(id: string) {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ['category', 'growth_rule', 'growth_rule.stages', 'growth_rule.stages.conditions', 'reviews', 'reviews.user'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${id} not found`);
    }

    return product;
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

    Object.assign(product, dto);
    return this.productRepository.save(product);
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

    const auditStatus =
      failedItems.length === 0
        ? AuditStatus.SUCCESS
        : succeededIds.length > 0
        ? AuditStatus.PARTIAL
        : AuditStatus.FAILED;

    await this.auditLogService.logAction({
      adminId,
      action: 'BULK_DELETE_PRODUCTS',
      targetType: 'products',
      targetIds: succeededIds,
      details: {
        totalRequested: ids.length,
        succeededCount: succeededIds.length,
        failedCount: failedItems.length,
        failedItems,
      },
      status: auditStatus,
    });

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
