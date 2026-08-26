import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../database/entities/category.entity';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

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
    return this.categoryRepository.remove(category);
  }
}
