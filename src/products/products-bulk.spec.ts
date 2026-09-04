import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { Product } from '../database/entities/product.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { StorageCleanupService } from '../common/storage/storage-cleanup.service';

describe('ProductsService - Bulk & Storage Cleanup', () => {
  let service: ProductsService;
  let mockProductRepo: any;
  let mockOrderItemRepo: any;
  let mockStorageCleanupService: Partial<StorageCleanupService>;
  let mockEntityManager: any;

  beforeEach(async () => {
    mockStorageCleanupService = {
      deleteFileByUrl: jest.fn().mockResolvedValue(true),
      deleteFilesByUrls: jest.fn().mockResolvedValue({ deleted: 2, failed: 0 }),
    };

    const qbMock: any = {
      getRawMany: jest.fn().mockResolvedValue([]),
      getRawOne: jest.fn().mockResolvedValue(null),
    };
    qbMock.innerJoin = jest.fn().mockReturnValue(qbMock);
    qbMock.leftJoin = jest.fn().mockReturnValue(qbMock);
    qbMock.leftJoinAndSelect = jest.fn().mockReturnValue(qbMock);
    qbMock.innerJoinAndSelect = jest.fn().mockReturnValue(qbMock);
    qbMock.select = jest.fn().mockReturnValue(qbMock);
    qbMock.addSelect = jest.fn().mockReturnValue(qbMock);
    qbMock.where = jest.fn().mockReturnValue(qbMock);
    qbMock.andWhere = jest.fn().mockReturnValue(qbMock);
    qbMock.orWhere = jest.fn().mockReturnValue(qbMock);
    qbMock.groupBy = jest.fn().mockReturnValue(qbMock);
    qbMock.addGroupBy = jest.fn().mockReturnValue(qbMock);
    qbMock.orderBy = jest.fn().mockReturnValue(qbMock);
    qbMock.addOrderBy = jest.fn().mockReturnValue(qbMock);

    mockOrderItemRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qbMock),
    };

    mockEntityManager = {
      find: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockProductRepo = {
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
      manager: {
        transaction: jest.fn().mockImplementation(async (callback) => {
          return callback(mockEntityManager);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: getRepositoryToken(Product),
          useValue: mockProductRepo,
        },
        {
          provide: getRepositoryToken(OrderItem),
          useValue: mockOrderItemRepo,
        },
        {
          provide: StorageCleanupService,
          useValue: mockStorageCleanupService,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  describe('remove (Single Product)', () => {
    it('should delete product record and clean up cover and gallery images from storage', async () => {
      const mockProduct = {
        id: 'prod-uuid-1',
        name: 'Organic Basil Seeds',
        image_url: 'https://test.supabase.co/storage/v1/object/public/products/basil.jpg',
        images: [
          'https://test.supabase.co/storage/v1/object/public/imgshot/basil-gallery-1.jpg',
          'https://test.supabase.co/storage/v1/object/public/imgshot/basil-gallery-2.jpg',
        ],
      };
      mockProductRepo.findOne.mockResolvedValueOnce(mockProduct);

      const result = await service.remove('prod-uuid-1');

      expect(result.success).toBe(true);
      expect(mockProductRepo.delete).toHaveBeenCalledWith('prod-uuid-1');
      expect(mockStorageCleanupService.deleteFilesByUrls).toHaveBeenCalledWith([
        'https://test.supabase.co/storage/v1/object/public/products/basil.jpg',
        'https://test.supabase.co/storage/v1/object/public/imgshot/basil-gallery-1.jpg',
        'https://test.supabase.co/storage/v1/object/public/imgshot/basil-gallery-2.jpg',
      ]);
    });
  });

  describe('removeGalleryImage', () => {
    it('should remove image from product array and trigger non-blocking file deletion', async () => {
      const targetUrl = 'https://test.supabase.co/storage/v1/object/public/imgshot/gallery-1.jpg';
      const mockProduct = {
        id: 'prod-uuid-1',
        images: [targetUrl, 'https://test.supabase.co/storage/v1/object/public/imgshot/gallery-2.jpg'],
      };
      mockProductRepo.findOne.mockResolvedValueOnce(mockProduct);

      const result = await service.removeGalleryImage('prod-uuid-1', targetUrl);

      expect(result.success).toBe(true);
      expect(mockProductRepo.save).toHaveBeenCalled();
      expect(mockStorageCleanupService.deleteFileByUrl).toHaveBeenCalledWith(targetUrl);
    });
  });

  describe('bulkRemove', () => {
    it('should delete multiple products in a transaction and cleanup all image files', async () => {
      const ids = ['prod-1', 'prod-2'];
      const existingProducts = [
        {
          id: 'prod-1',
          name: 'Product 1',
          image_url: 'https://test.supabase.co/storage/v1/object/public/products/p1.jpg',
          images: [],
        },
        {
          id: 'prod-2',
          name: 'Product 2',
          image_url: 'https://test.supabase.co/storage/v1/object/public/products/p2.jpg',
          images: ['https://test.supabase.co/storage/v1/object/public/imgshot/p2-1.jpg'],
        },
      ];

      mockEntityManager.find.mockResolvedValueOnce(existingProducts);

      const result = await service.bulkRemove(ids, 'admin-uuid-1');

      expect(result.totalRequested).toBe(2);
      expect(result.succeededCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(mockEntityManager.delete).toHaveBeenCalledTimes(2);

      expect(mockStorageCleanupService.deleteFilesByUrls).toHaveBeenCalledWith([
        'https://test.supabase.co/storage/v1/object/public/products/p1.jpg',
        'https://test.supabase.co/storage/v1/object/public/products/p2.jpg',
        'https://test.supabase.co/storage/v1/object/public/imgshot/p2-1.jpg',
      ]);
    });

    it('should handle partial bulk delete failures gracefully without breaking succeeded items', async () => {
      const ids = ['prod-exists', 'prod-missing'];
      mockEntityManager.find.mockResolvedValueOnce([
        { id: 'prod-exists', name: 'Existing Product', image_url: null, images: [] },
      ]);

      const result = await service.bulkRemove(ids, 'admin-uuid-1');

      expect(result.succeededCount).toBe(1);
      expect(result.failedCount).toBe(1);
      expect(result.failedItems[0].id).toBe('prod-missing');
    });
  });

  describe('findAll category filtering', () => {
    it('should filter by UUID when categoryId is a valid UUID', async () => {
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [{ id: 'prod-1', name: 'Product 1', stock: 10 }],
          1,
        ]),
      };
      mockProductRepo.createQueryBuilder = jest.fn().mockReturnValue(qbMock);

      const result: any = await service.findAll({
        categoryId: 'c0000001-0000-0000-0000-000000000001',
        page: 1,
        limit: 10,
      });

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        '(product.category_id = :catFilter OR category.id = :catFilter)',
        { catFilter: 'c0000001-0000-0000-0000-000000000001' },
      );
      expect(result.total).toBe(1);
    });

    it('should filter by category name when categoryId is a name string', async () => {
      const qbMock: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [{ id: 'prod-1', name: 'Product 1', stock: 10 }],
          1,
        ]),
      };
      mockProductRepo.createQueryBuilder = jest.fn().mockReturnValue(qbMock);

      const result: any = await service.findAll({
        categoryId: 'Herbs',
        page: 1,
        limit: 10,
      });

      expect(qbMock.andWhere).toHaveBeenCalledWith(
        'LOWER(category.name) = LOWER(:catFilter)',
        { catFilter: 'Herbs' },
      );
      expect(result.total).toBe(1);
    });
  });

  describe('update (Relation Foreign Key Preservation)', () => {
    it('should set category and growth_rule relations as objects with id rather than null', async () => {
      const existingProduct = {
        id: 'prod-uuid-1',
        name: 'Hemp RPF1',
        category_id: 'c-old',
        category: { id: 'c-old', name: 'Old Category' },
        rule_id: 'r-old',
        growth_rule: { id: 'r-old', name: 'Old Rule' },
        price: 150,
        stock: 10,
        harvest_days: 100,
        germination_days: 14,
      };

      mockProductRepo.findOne = jest.fn()
        .mockResolvedValueOnce(existingProduct)
        .mockResolvedValueOnce({
          ...existingProduct,
          category_id: 'c-new',
          category: { id: 'c-new', name: 'New Category' },
          rule_id: 'r-new',
          growth_rule: { id: 'r-new', name: 'New Rule' },
          stock: 20,
        });

      const updated = await service.update('prod-uuid-1', {
        stock: 20,
        category_id: 'c-new',
        rule_id: 'r-new',
      });

      expect(mockProductRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          stock: 20,
          category_id: 'c-new',
          category: { id: 'c-new' },
          rule_id: 'r-new',
          growth_rule: { id: 'r-new' },
        }),
      );
    });

    it('should nullify relations when null or empty string is explicitly supplied', async () => {
      const existingProduct = {
        id: 'prod-uuid-2',
        name: 'Product 2',
        category_id: 'c-old',
        category: { id: 'c-old' },
        rule_id: 'r-old',
        growth_rule: { id: 'r-old' },
        price: 50,
        stock: 5,
        harvest_days: 30,
        germination_days: 5,
      };

      mockProductRepo.findOne = jest.fn()
        .mockResolvedValueOnce(existingProduct)
        .mockResolvedValueOnce({
          ...existingProduct,
          category_id: null,
          category: null,
          rule_id: null,
          growth_rule: null,
        });

      await service.update('prod-uuid-2', {
        category_id: '',
        rule_id: null as any,
      });

      expect(mockProductRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          category_id: null,
          category: null,
          rule_id: null,
          growth_rule: null,
        }),
      );
    });
  });
});

