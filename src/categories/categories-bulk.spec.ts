import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CategoriesService } from './categories.service';
import { Category } from '../database/entities/category.entity';
import { Product } from '../database/entities/product.entity';

describe('CategoriesService - Bulk Delete', () => {
  let service: CategoriesService;
  let mockCategoryRepo: any;
  let mockProductRepo: any;
  let mockEntityManager: any;
  let mockQueryBuilder: any;

  beforeEach(async () => {
    mockQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 2 }),
    };

    mockEntityManager = {
      find: jest.fn().mockResolvedValue([
        { id: 'cat-1', name: 'Cat 1' },
        { id: 'cat-2', name: 'Cat 2' },
      ]),
      update: jest.fn().mockResolvedValue({ affected: 2 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockCategoryRepo = {
      manager: {
        transaction: jest.fn().mockImplementation(async (callback) => {
          return callback(mockEntityManager);
        }),
      },
    };

    mockProductRepo = {
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: getRepositoryToken(Category),
          useValue: mockCategoryRepo,
        },
        {
          provide: getRepositoryToken(Product),
          useValue: mockProductRepo,
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  describe('bulkRemove', () => {
    it('should nullify category_id on child products and delete categories', async () => {
      const ids = ['cat-1', 'cat-2'];

      const result = await service.bulkRemove(ids, 'admin-1');

      expect(result.totalRequested).toBe(2);
      expect(result.succeededCount).toBe(2);
      expect(result.failedCount).toBe(0);

      // Verify product FK nullification
      expect(mockEntityManager.update).toHaveBeenCalledTimes(2);
      expect(mockEntityManager.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe('create and update', () => {
    it('should create category cleanly with trimmed name', async () => {
      mockCategoryRepo.findOne = jest.fn().mockResolvedValue(null);
      mockCategoryRepo.create = jest.fn().mockImplementation((dto) => dto);
      mockCategoryRepo.save = jest.fn().mockImplementation((cat) => Promise.resolve({ id: 'cat-new', ...cat }));

      const res = await service.create({ name: '  Microgreens  ', description: 'Fresh sprouts', icon: 'spa' });

      expect(res.name).toBe('Microgreens');
      expect(mockCategoryRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: 'Microgreens', icon: 'spa' }));
    });

    it('should update category cleanly without modifying unrelated fields', async () => {
      const existing = { id: 'cat-1', name: 'Herbs', description: 'Old desc', icon: 'eco' };
      mockCategoryRepo.findOne = jest.fn()
        .mockResolvedValueOnce(existing) // find by id
        .mockResolvedValueOnce(null); // find duplicate check
      mockCategoryRepo.save = jest.fn().mockImplementation((cat) => Promise.resolve(cat));

      const updated = await service.update('cat-1', { name: 'Culinary Herbs', description: 'Updated desc' });

      expect(updated.name).toBe('Culinary Herbs');
      expect(updated.description).toBe('Updated desc');
      expect(mockCategoryRepo.save).toHaveBeenCalled();
    });
  });
});

