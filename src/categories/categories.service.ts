import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Category } from '../database/entities/category.entity';
import { Product } from '../database/entities/product.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { BulkDeleteResult, FailedItem } from '../common/dto/bulk-delete.dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
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
    const trimmedName = dto.name?.trim();
    if (!trimmedName) {
      throw new BadRequestException('Category name cannot be empty');
    }
    const existing = await this.categoryRepository.findOne({
      where: { name: trimmedName },
    });
    if (existing) {
      throw new ConflictException('A category with this name already exists');
    }
    const category = this.categoryRepository.create({
      name: trimmedName,
      description: dto.description?.trim() || null as any,
      icon: dto.icon?.trim() || 'eco',
    });
    return this.categoryRepository.save(category);
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.categoryRepository.findOne({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    if (dto.name !== undefined) {
      const trimmedName = dto.name.trim();
      if (trimmedName.length === 0) {
        throw new BadRequestException('Category name cannot be empty');
      }
      if (trimmedName !== category.name) {
        const existing = await this.categoryRepository.findOne({
          where: { name: trimmedName },
        });
        if (existing && existing.id !== id) {
          throw new ConflictException('A category with this name already exists');
        }
      }
      category.name = trimmedName;
    }

    if (dto.description !== undefined) {
      category.description = dto.description !== null && dto.description.trim().length > 0
        ? dto.description.trim()
        : null as any;
    }

    if (dto.icon !== undefined) {
      category.icon = dto.icon.trim().length > 0 ? dto.icon.trim() : 'eco';
    }

    return this.categoryRepository.save(category);
  }

  async remove(id: string) {
    const category = await this.categoryRepository.findOne({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
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
