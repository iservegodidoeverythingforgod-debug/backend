import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { Product } from '../database/entities/product.entity';
import { StorageCleanupService } from '../common/storage/storage-cleanup.service';

describe('ProductsService - Bulk & Storage Cleanup', () => {
  let service: ProductsService;
  let mockProductRepo: any;
  let mockStorageCleanupService: Partial<StorageCleanupService>;
  let mockEntityManager: any;

  beforeEach(async () => {
    mockStorageCleanupService = {
      deleteFileByUrl: jest.fn().mockResolvedValue(true),
      deleteFilesByUrls: jest.fn().mockResolvedValue({ deleted: 2, failed: 0 }),
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
});

