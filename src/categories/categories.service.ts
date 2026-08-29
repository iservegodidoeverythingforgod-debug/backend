import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Category } from '../database/entities/category.entity';
import { Product } from '../database/entities/product.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { AuditLogService } from '../common/audit/audit-log.service';
import { BulkDeleteResult, FailedItem } from '../common/dto/bulk-delete.dto';
import { AuditStatus } from '../database/entities/audit-log.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll() {
    return this.categoryRepository.find({
      relations: ['products'],
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string) {
    const category = await this.categoryRepository.findOne({
      where: { id },
      relations: ['products'],
    });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return category;
  }

  async create(dto: CreateCategoryDto) {
    const existing = await this.categoryRepository.findOne({
      where: [{ name: dto.name }, { slug: dto.slug }],
    });
    if (existing) {
      throw new ConflictException('A category with this name or slug already exists');
    }
    const category = this.categoryRepository.create(dto);
    return this.categoryRepository.save(category);
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.findOne(id);
    Object.assign(category, dto);
    return this.categoryRepository.save(category);
  }

  async remove(id: string) {
    const category = await this.findOne(id);
    // Unlink products
    await this.categoryRepository.manager.update(
      Product,
      { category_id: id },
      { category_id: null as any },
    );
    return this.categoryRepository.remove(category);
  }

  async bulkRemove(ids: string[], adminId: string): Promise<BulkDeleteResult> {
    const succeededIds: string[] = [];
    const failedItems: FailedItem[] = [];

    await this.categoryRepository.manager.transaction(async (manager) => {
      const existingCategories = await manager.find(Category, {
        where: { id: In(ids) },
      });

      const foundMap = new Map(existingCategories.map((c) => [c.id, c]));

      for (const id of ids) {
        const cat = foundMap.get(id);
        if (!cat) {
          failedItems.push({ id, reason: `Category with ID ${id} not found` });
          continue;
        }

        try {
          // Unlink products belonging to this category
          await manager.update(Product, { category_id: id }, { category_id: null as any });
          await manager.delete(Category, { id });
          succeededIds.push(id);
        } catch (err) {
          failedItems.push({
            id,
            reason: err instanceof Error ? err.message : 'Database error during category deletion',
          });
        }
      }
    });

    const auditStatus =
      failedItems.length === 0
        ? AuditStatus.SUCCESS
        : succeededIds.length > 0
        ? AuditStatus.PARTIAL
        : AuditStatus.FAILED;

    await this.auditLogService.logAction({
      adminId,
      action: 'BULK_DELETE_CATEGORIES',
      targetType: 'categories',
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
      action: 'BULK_DELETE_CATEGORIES',
    };
  }
}
