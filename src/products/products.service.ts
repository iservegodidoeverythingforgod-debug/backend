import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../database/entities/product.entity';
import { CreateProductDto, UpdateProductDto } from './dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
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
    }
    return {
      success: true,
      images: product.images || [],
    };
  }

  async remove(id: string) {
    const product = await this.findOne(id);
    // Hard delete: foreign key on order_items has ON DELETE SET NULL, so historical order items are preserved with product_id = null
    await this.productRepository.delete(id);
    return {
      success: true,
      action: 'deleted',
      message: `Product '${product.name}' deleted successfully`,
    };
  }
}
