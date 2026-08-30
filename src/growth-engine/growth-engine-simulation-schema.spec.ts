import { BadRequestException, Logger } from '@nestjs/common';
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
import { AuditLogService } from '../common/audit/audit-log.service';

describe('GrowthEngineService - Input Schema & Simulation Validation', () => {
  let service: GrowthEngineService;
  let mockRuleRepo: any;
  let mockStageRepo: any;
  let mockConditionRepo: any;
  let mockProductRepo: any;
  let mockAnimationAssetRepo: any;

  beforeEach(async () => {
    mockRuleRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn().mockImplementation((r) => r),
      save: jest.fn().mockImplementation((r) => Promise.resolve(r)),
    };
    mockStageRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    mockConditionRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    mockProductRepo = {
      findOne: jest.fn(),
    };
    mockAnimationAssetRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GrowthEngineService,
        { provide: getRepositoryToken(GrowthRule), useValue: mockRuleRepo },
        { provide: getRepositoryToken(GrowthStage), useValue: mockStageRepo },
        { provide: getRepositoryToken(GrowthCondition), useValue: mockConditionRepo },
        { provide: getRepositoryToken(Product), useValue: mockProductRepo },
        { provide: getRepositoryToken(AnimationAsset), useValue: mockAnimationAssetRepo },
        { provide: SupabaseStorageService, useValue: {} },
        { provide: StorageCleanupService, useValue: {} },
        { provide: AuditLogService, useValue: { logAction: jest.fn() } },
      ],
    }).compile();

    service = module.get<GrowthEngineService>(GrowthEngineService);
  });

  describe('validateInputDefinitions', () => {
    it('should pass for valid number inputs with min, max, and valid default', () => {
      expect(() => {
        service.validateInputDefinitions([
          { key: 'water', type: 'number', min: 10, max: 80, default: 45 },
          { key: 'temperature', type: 'number', min: 0, max: 50 },
        ]);
      }).not.toThrow();
    });

    it('should throw BadRequestException if number input lacks min or max', () => {
      expect(() => {
        service.validateInputDefinitions([
          { key: 'water', type: 'number' } as any,
        ]);
      }).toThrow(BadRequestException);
    });

    it('should throw BadRequestException if number input has min >= max', () => {
      expect(() => {
        service.validateInputDefinitions([
          { key: 'water', type: 'number', min: 80, max: 20 },
        ]);
      }).toThrow(BadRequestException);
    });

    it('should throw BadRequestException if number default is outside [min, max]', () => {
      expect(() => {
        service.validateInputDefinitions([
          { key: 'water', type: 'number', min: 10, max: 80, default: 90 },
        ]);
      }).toThrow(BadRequestException);
    });

    it('should pass for valid enum inputs with enumValues and valid default', () => {
      expect(() => {
        service.validateInputDefinitions([
          { key: 'weather', type: 'enum', enumValues: ['sunny', 'cloudy', 'rainy'], default: 'cloudy' },
        ]);
      }).not.toThrow();
    });

    it('should throw BadRequestException if enum input declares min or max', () => {
      expect(() => {
        service.validateInputDefinitions([
          { key: 'weather', type: 'enum', enumValues: ['sunny', 'rainy'], min: 0 } as any,
        ]);
      }).toThrow(BadRequestException);
    });

    it('should throw BadRequestException if enum default is not in enumValues', () => {
      expect(() => {
        service.validateInputDefinitions([
          { key: 'weather', type: 'enum', enumValues: ['sunny', 'cloudy'], default: 'snowy' },
        ]);
      }).toThrow(BadRequestException);
    });
  });

  describe('evaluateSimulation - Defaults, Clamping, and Single-Select Enums', () => {
    it('should use authored default and clamp out-of-range numbers during simulation', async () => {
      const mockRule: any = {
        id: 'rule-test-1',
        name: 'Herb Growth Rule',
        input_definitions: [
          { key: 'water', type: 'number', min: 10, max: 80, default: 45 },
          { key: 'sunlight', type: 'number', min: 0, max: 100, default: 60 },
          { key: 'weather', type: 'enum', enumValues: ['sunny', 'cloudy', 'rainy'], default: 'cloudy' },
        ],
        stages: [
          {
            id: 'stage-1',
            stage_name: 'Germination',
            stage_order: 1,
            min_day: 1,
            max_day: 30,
            conditions: [],
          },
        ],
      };

      mockRuleRepo.findOne.mockResolvedValue(mockRule);

      // Simulation 1: Missing water (should use default: 45), Out-of-bounds sunlight: 150 (should clamp to 80), Missing weather (should use default: 'cloudy')
      const res = await service.simulateDirect({
        ruleId: 'rule-test-1',
        cultivationDay: 10,
        inputs: { sunlight: 150 },
      });

      expect(res.inputs.water).toBe(45);
      expect(res.inputs.sunlight).toBe(100);
      expect(res.inputs.weather).toBe('cloudy');
    });

    it('should handle legacy rule missing min/max without throwing and log warning', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

      const legacyRule: any = {
        id: 'legacy-rule-123',
        name: 'Legacy Rule',
        input_definitions: [
          { key: 'water', type: 'number' }, // No min/max
          { key: 'weather', type: 'enum', enumValues: ['sunny', 'rainy'] },
        ],
        stages: [
          {
            id: 'stage-1',
            stage_name: 'Stage 1',
            stage_order: 1,
            min_day: 1,
            max_day: 30,
            conditions: [],
          },
        ],
      };

      mockRuleRepo.findOne.mockResolvedValue(legacyRule);

      const res = await service.simulateDirect({
        ruleId: 'legacy-rule-123',
        cultivationDay: 5,
        inputs: { water: 120, weather: ['rainy', 'sunny'] }, // legacy array payload
      });

      // Should clamp against fallback [0, 100]
      expect(res.inputs.water).toBe(100);
      // Should take first valid enum from array
      expect(res.inputs.weather).toBe('rainy');
      // Should have logged warnings
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('evaluateExpression - Direct Equality & In Operator', () => {
    it('should evaluate == and != with direct string equality', () => {
      const context = { weather: 'rainy', day: 10 };

      expect(service.evaluateExpression('weather == rainy', context)).toBe(true);
      expect(service.evaluateExpression('weather == sunny', context)).toBe(false);
      expect(service.evaluateExpression('weather != sunny', context)).toBe(true);
      expect(service.evaluateExpression('weather != rainy', context)).toBe(false);
    });

    it('should evaluate in [...] operator against single-select string value', () => {
      const context = { weather: 'rainy' };

      expect(service.evaluateExpression('weather in [sunny, rainy, stormy]', context)).toBe(true);
      expect(service.evaluateExpression('weather in [sunny, clear]', context)).toBe(false);
    });

    it('should evaluate compound expressions', () => {
      const context = { water: 50, weather: 'rainy' };

      expect(service.evaluateExpression('water >= 40 and weather == rainy', context)).toBe(true);
      expect(service.evaluateExpression('water > 60 or weather in [rainy, stormy]', context)).toBe(true);
      expect(service.evaluateExpression('water > 60 and weather == rainy', context)).toBe(false);
    });
  });
});
