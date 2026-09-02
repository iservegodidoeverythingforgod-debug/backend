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
});

