import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GrowthEngineService } from './growth-engine.service';
import { GrowthRule } from '../database/entities/growth-rule.entity';
import { GrowthStage } from '../database/entities/growth-stage.entity';
import { GrowthCondition } from '../database/entities/growth-condition.entity';
import { Product } from '../database/entities/product.entity';
import { AnimationAsset } from '../database/entities/animation-asset.entity';
import { SupabaseStorageService } from '../common/storage/supabase-storage.service';
import { StorageCleanupService } from '../common/storage/storage-cleanup.service';

describe('GrowthEngineService - Bulk Animations & Storage Cleanup', () => {
  let service: GrowthEngineService;
  let mockAnimationAssetRepo: any;
  let mockStorageCleanupService: Partial<StorageCleanupService>;
  let mockEntityManager: any;

  let mockRuleRepo: any;
  let mockRuleQueryBuilder: any;

  beforeEach(async () => {
    mockStorageCleanupService = {
      deleteFileByUrl: jest.fn().mockResolvedValue(true),
      deleteFilesByUrls: jest.fn().mockResolvedValue({ deleted: 2, failed: 0 }),
    };

    mockEntityManager = {
      find: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockRuleQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockRuleRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation((r) => r),
      save: jest.fn().mockImplementation((r) => Promise.resolve(r)),
      createQueryBuilder: jest.fn().mockReturnValue(mockRuleQueryBuilder),
    };

    mockAnimationAssetRepo = {
      findOne: jest.fn(),
      remove: jest.fn().mockResolvedValue({} as any),
      manager: {
        transaction: jest.fn().mockImplementation(async (callback) => {
          return callback(mockEntityManager);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GrowthEngineService,
        {
          provide: getRepositoryToken(GrowthRule),
          useValue: mockRuleRepo,
        },
        {
          provide: getRepositoryToken(GrowthStage),
          useValue: {},
        },
        {
          provide: getRepositoryToken(GrowthCondition),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Product),
          useValue: {},
        },
        {
          provide: getRepositoryToken(AnimationAsset),
          useValue: mockAnimationAssetRepo,
        },
        {
          provide: SupabaseStorageService,
          useValue: {},
        },
        {
          provide: StorageCleanupService,
          useValue: mockStorageCleanupService,
        },
      ],
    }).compile();

    service = module.get<GrowthEngineService>(GrowthEngineService);
  });

  describe('deleteAnimation', () => {
    it('should delete asset and clean up animation file in storage', async () => {
      const asset = {
        id: 'anim-1',
        name: 'Sprout Animation',
        file_url: 'https://test.supabase.co/storage/v1/object/public/animations/sprout.json',
      };
      mockAnimationAssetRepo.findOne.mockResolvedValueOnce(asset);

      const result = await service.deleteAnimation('anim-1');

      expect(result.success).toBe(true);
      expect(mockStorageCleanupService.deleteFileByUrl).toHaveBeenCalledWith(asset.file_url);
      expect(mockAnimationAssetRepo.remove).toHaveBeenCalledWith(asset);
    });
  });

  describe('bulkDeleteAnimations', () => {
    it('should bulk delete animation assets and clean up files', async () => {
      const ids = ['anim-1', 'anim-2'];
      mockEntityManager.find.mockResolvedValueOnce([
        { id: 'anim-1', file_url: 'https://test.supabase.co/storage/v1/object/public/animations/a1.json' },
        { id: 'anim-2', file_url: 'https://test.supabase.co/storage/v1/object/public/animations/a2.mp4' },
      ]);

      const result = await service.bulkDeleteAnimations(ids, 'admin-1');

      expect(result.totalRequested).toBe(2);
      expect(result.succeededCount).toBe(2);
      expect(result.failedCount).toBe(0);

      expect(mockStorageCleanupService.deleteFilesByUrls).toHaveBeenCalledWith([
        'https://test.supabase.co/storage/v1/object/public/animations/a1.json',
        'https://test.supabase.co/storage/v1/object/public/animations/a2.mp4',
      ]);
    });
  });

  describe('GrowthRule default flag management', () => {
    it('should unmark previous default rules via queryBuilder when updateRule sets is_default: true', async () => {
      const existingRule = {
        id: '604f1b4f-0f6f-494b-a8c8-08c93163b92f',
        name: 'Standard Basil Growth Model',
        is_default: false,
        input_definitions: [],
        stages: [],
      };
      mockRuleRepo.findOne.mockResolvedValueOnce(existingRule);

      const updated = await service.updateRule('604f1b4f-0f6f-494b-a8c8-08c93163b92f', {
        is_default: true,
      });

      expect(mockRuleRepo.createQueryBuilder).toHaveBeenCalled();
      expect(mockRuleQueryBuilder.update).toHaveBeenCalled();
      expect(mockRuleQueryBuilder.set).toHaveBeenCalledWith({ is_default: false });
      expect(mockRuleQueryBuilder.where).toHaveBeenCalledWith('is_default = :isDef', { isDef: true });
      expect(mockRuleQueryBuilder.execute).toHaveBeenCalled();
      expect(updated.is_default).toBe(true);
    });

    it('should unmark previous default rules via queryBuilder when createRule sets is_default: true', async () => {
      const newRule = await service.createRule({
        name: 'Rosemary Growth Model',
        description: 'Default model for herbs',
        is_default: true,
        input_definitions: [],
      });

      expect(mockRuleRepo.createQueryBuilder).toHaveBeenCalled();
      expect(mockRuleQueryBuilder.update).toHaveBeenCalled();
      expect(mockRuleQueryBuilder.set).toHaveBeenCalledWith({ is_default: false });
      expect(mockRuleQueryBuilder.where).toHaveBeenCalledWith('is_default = :isDef', { isDef: true });
      expect(newRule.is_default).toBe(true);
    });
  });
});
