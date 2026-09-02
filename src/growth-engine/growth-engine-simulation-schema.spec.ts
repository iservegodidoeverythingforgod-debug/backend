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

describe('GrowthEngineService - Input Schema & Stage Initial Inputs Validation', () => {
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
      create: jest.fn().mockImplementation((s) => s),
      save: jest.fn().mockImplementation((s) => Promise.resolve({ id: 'stage-created-id', ...s })),
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

  describe('validateStageInitialInputs & Stage Creation Coverage', () => {
    const parentRule: any = {
      id: 'parent-rule-1',
      name: 'Basil Model',
      input_definitions: [
        { key: 'water', type: 'number', min: 10, max: 100 },
        { key: 'temperature', type: 'number', min: 15, max: 40 },
        { key: 'weather', type: 'enum', enumValues: ['sunny', 'rainy', 'cloudy'] },
      ],
      stages: [],
    };

    it('should throw 400 BadRequestException naming the missing key when initial_inputs has partial coverage', async () => {
      mockRuleRepo.findOne.mockResolvedValue(parentRule);

      await expect(
        service.addStage('parent-rule-1', {
          stage_name: 'Germination',
          start_day: 1,
          end_day: 10,
          initial_inputs: {
            water: 80,
            temperature: 25,
            // 'weather' is missing!
          },
        }),
      ).rejects.toThrow(BadRequestException);

      try {
        await service.addStage('parent-rule-1', {
          stage_name: 'Germination',
          start_day: 1,
          end_day: 10,
          initial_inputs: {
            water: 80,
            temperature: 25,
          },
        });
      } catch (err: any) {
        expect(err.message).toContain('weather');
        expect(err.message).toContain('missing required initial_inputs');
      }
    });

    it('should throw 400 BadRequestException when initial_inputs contains unknown/extra key', async () => {
      mockRuleRepo.findOne.mockResolvedValue(parentRule);

      await expect(
        service.addStage('parent-rule-1', {
          stage_name: 'Germination',
          start_day: 1,
          end_day: 10,
          initial_inputs: {
            water: 80,
            temperature: 25,
            weather: 'rainy',
            extra_typo_key: 123,
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw 400 BadRequestException when a numeric initial value is out of bounds', async () => {
      mockRuleRepo.findOne.mockResolvedValue(parentRule);

      await expect(
        service.addStage('parent-rule-1', {
          stage_name: 'Germination',
          start_day: 1,
          end_day: 10,
          initial_inputs: {
            water: 150, // exceeds max 100
            temperature: 25,
            weather: 'rainy',
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw 400 BadRequestException when an enum initial value is not in enumValues', async () => {
      mockRuleRepo.findOne.mockResolvedValue(parentRule);

      await expect(
        service.addStage('parent-rule-1', {
          stage_name: 'Germination',
          start_day: 1,
          end_day: 10,
          initial_inputs: {
            water: 80,
            temperature: 25,
            weather: 'snowy', // invalid enum
          },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should succeed when stage provides full, valid coverage for all declared variables', async () => {
      mockRuleRepo.findOne.mockResolvedValue(parentRule);

      const stage = await service.addStage('parent-rule-1', {
        stage_name: 'Germination',
        start_day: 1,
        end_day: 10,
        initial_inputs: {
          water: 80,
          temperature: 28,
          weather: 'rainy',
        },
      });

      expect(stage).toBeDefined();
      expect(stage.initial_inputs).toEqual({
        water: 80,
        temperature: 28,
        weather: 'rainy',
      });
    });
  });

  describe('evaluateSimulation - Stage Initial Inputs & Legacy Fallback', () => {
    it('should populate simulation inputs from active stage initial_inputs when inputs are omitted', async () => {
      const mockRule: any = {
        id: 'rule-multistage',
        name: 'Multistage Herb Model',
        input_definitions: [
          { key: 'water', type: 'number', min: 0, max: 100 },
          { key: 'sunlight', type: 'number', min: 0, max: 100 },
          { key: 'weather', type: 'enum', enumValues: ['sunny', 'cloudy', 'rainy'] },
        ],
        stages: [
          {
            id: 'stage-germination',
            stage_name: 'Germination',
            stage_order: 1,
            min_day: 1,
            max_day: 10,
            initial_inputs: {
              water: 85,
              sunlight: 20,
              weather: 'rainy',
            },
            conditions: [],
          },
          {
            id: 'stage-vegetative',
            stage_name: 'Vegetative',
            stage_order: 2,
            min_day: 11,
            max_day: 30,
            initial_inputs: {
              water: 45,
              sunlight: 90,
              weather: 'sunny',
            },
            conditions: [],
          },
        ],
      };

      mockRuleRepo.findOne.mockResolvedValue(mockRule);

      // Simulation 1 on Day 5 (Germination): No inputs provided -> Should resolve Germination's initial_inputs
      const resGerm = await service.simulateDirect({
        ruleId: 'rule-multistage',
        cultivationDay: 5,
        inputs: {},
      });
      expect(resGerm.inputs.water).toBe(85);
      expect(resGerm.inputs.sunlight).toBe(20);
      expect(resGerm.inputs.weather).toBe('rainy');

      // Simulation 2 on Day 20 (Vegetative): No inputs provided -> Should resolve Vegetative's initial_inputs
      const resVeg = await service.simulateDirect({
        ruleId: 'rule-multistage',
        cultivationDay: 20,
        inputs: {},
      });
      expect(resVeg.inputs.water).toBe(45);
      expect(resVeg.inputs.sunlight).toBe(90);
      expect(resVeg.inputs.weather).toBe('sunny');
    });

    it('should handle legacy stage missing initial_inputs without throwing and log warning', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

      const legacyRule: any = {
        id: 'legacy-rule-123',
        name: 'Legacy Rule',
        input_definitions: [
          { key: 'water', type: 'number', min: 10, max: 80, default: 40 },
          { key: 'weather', type: 'enum', enumValues: ['sunny', 'rainy'], default: 'sunny' },
        ],
        stages: [
          {
            id: 'legacy-stage-1',
            stage_name: 'Stage 1',
            stage_order: 1,
            min_day: 1,
            max_day: 30,
            initial_inputs: {}, // Missing declared variables!
            conditions: [],
          },
        ],
      };

      mockRuleRepo.findOne.mockResolvedValue(legacyRule);

      const res = await service.simulateDirect({
        ruleId: 'legacy-rule-123',
        cultivationDay: 5,
        inputs: {}, // Omitted
      });

      // Should fall back to def.default
      expect(res.inputs.water).toBe(40);
      expect(res.inputs.weather).toBe('sunny');
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
