import { Test, TestingModule } from '@nestjs/testing';
import { StorageCleanupService } from './storage-cleanup.service';
import { SupabaseStorageService, BUCKET_NAMES } from './supabase-storage.service';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

describe('StorageCleanupService', () => {
  let service: StorageCleanupService;
  let mockSupabaseStorageService: Partial<SupabaseStorageService>;
  let mockDataSource: Partial<DataSource>;
  let mockQueryRunner: any;

  beforeEach(async () => {
    mockSupabaseStorageService = {
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };

    mockQueryRunner = {
      query: jest.fn().mockResolvedValue([]),
      release: jest.fn().mockResolvedValue(undefined),
    };

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageCleanupService,
        {
          provide: SupabaseStorageService,
          useValue: mockSupabaseStorageService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'SUPABASE_S3_ENDPOINT') {
                return 'https://test-project.supabase.co/storage/v1/s3';
              }
              return 'test-value';
            },
          },
        },
      ],
    }).compile();

    service = module.get<StorageCleanupService>(StorageCleanupService);
  });

  describe('parseBucketAndKey', () => {
    it('should parse standard Supabase public object URLs', () => {
      const url = 'https://test-project.supabase.co/storage/v1/object/public/products/seed-herbs-01.jpg';
      const parsed = service.parseBucketAndKey(url);
      expect(parsed).toEqual({
        bucket: 'products',
        key: 'seed-herbs-01.jpg',
      });
    });

    it('should parse nested keys in public object URLs', () => {
      const url = 'https://test-project.supabase.co/storage/v1/object/public/imgshot/gallery/2026/shot1.webp';
      const parsed = service.parseBucketAndKey(url);
      expect(parsed).toEqual({
        bucket: 'imgshot',
        key: 'gallery/2026/shot1.webp',
      });
    });

    it('should parse Supabase S3 endpoint URLs', () => {
      const url = 'https://test-project.supabase.co/storage/v1/s3/avatars/user-123.png';
      const parsed = service.parseBucketAndKey(url);
      expect(parsed).toEqual({
        bucket: 'avatars',
        key: 'user-123.png',
      });
    });

    it('should parse relative bucket paths', () => {
      const pathWithSlash = '/products/basil-premium.jpg';
      expect(service.parseBucketAndKey(pathWithSlash)).toEqual({
        bucket: 'products',
        key: 'basil-premium.jpg',
      });

      const pathNoSlash = 'animations/stage1-sprout.json';
      expect(service.parseBucketAndKey(pathNoSlash)).toEqual({
        bucket: 'animations',
        key: 'stage1-sprout.json',
      });
    });

    it('should return null for non-storage or external URLs', () => {
      expect(service.parseBucketAndKey(null)).toBeNull();
      expect(service.parseBucketAndKey('')).toBeNull();
      expect(service.parseBucketAndKey('https://external-images.unsplash.com/photo-123')).toBeNull();
      expect(service.parseBucketAndKey('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...')).toBeNull();
    });
  });

  describe('deleteFileByUrl', () => {
    it('should successfully call SupabaseStorageService.deleteFile on valid URL', async () => {
      const url = 'https://test-project.supabase.co/storage/v1/object/public/products/item-01.jpg';
      const result = await service.deleteFileByUrl(url);

      expect(result).toBe(true);
      expect(mockSupabaseStorageService.deleteFile).toHaveBeenCalledWith('products', 'item-01.jpg');
    });

    it('should return false gracefully and not throw on invalid URL', async () => {
      const result = await service.deleteFileByUrl('https://random.com/not-supabase.png');
      expect(result).toBe(false);
      expect(mockSupabaseStorageService.deleteFile).not.toHaveBeenCalled();
    });

    it('should catch storage deletion errors gracefully and return false without crashing', async () => {
      (mockSupabaseStorageService.deleteFile as jest.Mock).mockRejectedValueOnce(
        new Error('S3 Network timeout'),
      );

      const url = 'https://test-project.supabase.co/storage/v1/object/public/products/item-01.jpg';
      const result = await service.deleteFileByUrl(url);

      expect(result).toBe(false);
    });
  });

  describe('deleteFilesByUrls', () => {
    it('should perform batch deletion for an array of URLs', async () => {
      const urls = [
        'https://test-project.supabase.co/storage/v1/object/public/products/item-01.jpg',
        'https://test-project.supabase.co/storage/v1/object/public/imgshot/gallery-01.jpg',
        null,
        'invalid-url',
      ];

      const result = await service.deleteFilesByUrls(urls);
      expect(result.deleted).toBe(2);
      expect(result.failed).toBe(1);
    });

    it('should return 0/0 for empty list', async () => {
      const result = await service.deleteFilesByUrls([]);
      expect(result).toEqual({ deleted: 0, failed: 0 });
    });
  });

  describe('cleanConfirmedOrphans', () => {
    it('should delete each confirmed item and report deleted and failed counts', async () => {
      (mockSupabaseStorageService.deleteFile as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Access Denied'));

      const items = [
        { bucket: 'avatars', key: 'old-orphan-1.png' },
        { bucket: 'products', key: 'corrupt-image.jpg' },
      ];

      const result = await service.cleanConfirmedOrphans(items);
      expect(result.deleted).toEqual(['avatars/old-orphan-1.png']);
      expect(result.failed).toEqual(['products/corrupt-image.jpg']);
    });
  });
});
