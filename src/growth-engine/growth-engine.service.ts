import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { GrowthRule, InputDefinition } from '../database/entities/growth-rule.entity';
import { GrowthStage } from '../database/entities/growth-stage.entity';
import {
  GrowthCondition,
  RuleItem,
} from '../database/entities/growth-condition.entity';
import { Product } from '../database/entities/product.entity';
import { AnimationAsset } from '../database/entities/animation-asset.entity';
import {
  CreateGrowthRuleDto,
  UpdateGrowthRuleDto,
  CreateGrowthStageDto,
  UpdateGrowthStageDto,
  CreateGrowthConditionDto,
  UpdateGrowthConditionDto,
  SimulateGrowthDto,
} from './dto';
import { SupabaseStorageService } from '../common/storage/supabase-storage.service';
import { StorageCleanupService } from '../common/storage/storage-cleanup.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { BulkDeleteResult, FailedItem } from '../common/dto/bulk-delete.dto';
import { AuditStatus } from '../database/entities/audit-log.entity';
import { extname } from 'path';
import { randomUUID } from 'crypto';

export interface ConditionEvaluationResult {
  conditionId?: string;
  conditionName: string;
  inputs: Record<string, any>;
  matchedRule: string;
  to: string;
  statusColor: string;
  animationAssetId?: string;
  animationAssetUrl?: string;
}

export interface SimulationResult {
  productId?: string;
  productName?: string;
  ruleId: string;
  ruleName: string;
  stage: {
    id?: string;
    name: string;
    order: number;
    animation: string;
    animationAssetId?: string;
    animationAssetUrl?: string;
    minDay: number;
    maxDay: number;
    startDay: number;
    endDay: number;
  };
  hasActiveStage: boolean;
  cultivationDay: number;
  inputs: Record<string, any>;
  conditionResults: ConditionEvaluationResult[];
  animation: string;
  animationAssetUrl: string | null;
  evaluation?: ConditionEvaluationResult;
}

@Injectable()
export class GrowthEngineService {
  private readonly logger = new Logger(GrowthEngineService.name);

  constructor(
    @InjectRepository(GrowthRule)
    private readonly ruleRepository: Repository<GrowthRule>,
    @InjectRepository(GrowthStage)
    private readonly stageRepository: Repository<GrowthStage>,
    @InjectRepository(GrowthCondition)
    private readonly conditionRepository: Repository<GrowthCondition>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(AnimationAsset)
    private readonly animationAssetRepository: Repository<AnimationAsset>,
    private readonly supabaseStorageService: SupabaseStorageService,
    private readonly storageCleanupService: StorageCleanupService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // ===========================================================================
  // GROWTH RULES CRUD & VALIDATION
  // ===========================================================================

  validateInputDefinitions(definitions?: InputDefinition[]) {
    if (!definitions || definitions.length === 0) return;

    const seenKeys = new Set<string>();
    const safeIdentRegex = /^[a-z][a-z0-9_]*$/i;

    for (const def of definitions) {
      const keyLower = def.key.toLowerCase().trim();
      if (!safeIdentRegex.test(def.key)) {
        throw new BadRequestException(
          `Input key "${def.key}" is invalid. Must start with a letter and contain only alphanumeric characters and underscores.`,
        );
      }
      if (seenKeys.has(keyLower)) {
        throw new BadRequestException(
          `Duplicate input key "${def.key}" in inputDefinitions. Each key must be unique.`,
        );
      }
      seenKeys.add(keyLower);

      if (def.type === 'enum') {
        if (!Array.isArray(def.enumValues) || def.enumValues.length < 2) {
          throw new BadRequestException(
            `Enum input "${def.key}" must declare "enumValues" array with at least 2 entries.`,
          );
        }
        if (def.min !== undefined || def.max !== undefined) {
          throw new BadRequestException(
            `Enum input "${def.key}" must not declare min or max bounds.`,
          );
        }
        const enumSet = new Set<string>();
        for (const val of def.enumValues) {
          if (typeof val !== 'string' || val.trim().length === 0) {
            throw new BadRequestException(
              `Enum input "${def.key}" contains empty or invalid enum value.`,
            );
          }
          if (enumSet.has(val.trim().toLowerCase())) {
            throw new BadRequestException(
              `Enum input "${def.key}" has duplicate enum value "${val}".`,
            );
          }
          enumSet.add(val.trim().toLowerCase());
        }
        if (def.default !== undefined && def.default !== null) {
          if (typeof def.default !== 'string' || def.default.trim().length === 0) {
            throw new BadRequestException(
              `Default value for enum input "${def.key}" must be a non-empty string.`,
            );
          }
          if (!enumSet.has(def.default.trim().toLowerCase())) {
            throw new BadRequestException(
              `Default value "${def.default}" for enum input "${def.key}" must be one of: ${def.enumValues.join(', ')}.`,
            );
          }
        }
      } else if (def.type === 'number') {
        if (def.enumValues && def.enumValues.length > 0) {
          throw new BadRequestException(
            `Number input "${def.key}" must not declare enumValues.`,
          );
        }
        if (
          typeof def.min !== 'number' ||
          isNaN(def.min) ||
          typeof def.max !== 'number' ||
          isNaN(def.max)
        ) {
          throw new BadRequestException(
            `Number input "${def.key}" must declare both numeric "min" and "max" bounds.`,
          );
        }
        if (def.min >= def.max) {
          throw new BadRequestException(
            `Number input "${def.key}" has invalid bounds: min (${def.min}) must be strictly less than max (${def.max}).`,
          );
        }
        if (def.default !== undefined && def.default !== null) {
          if (typeof def.default !== 'number' || isNaN(def.default)) {
            throw new BadRequestException(
              `Default value for number input "${def.key}" must be a valid number.`,
            );
          }
          if (def.default < def.min || def.default > def.max) {
            throw new BadRequestException(
              `Default value (${def.default}) for number input "${def.key}" must satisfy min (${def.min}) <= default <= max (${def.max}).`,
            );
          }
        }
      } else {
        throw new BadRequestException(
          `Invalid input type "${(def as any).type}" for key "${def.key}". Must be 'number' or 'enum'.`,
        );
      }
    }
  }

  async findAllRules(): Promise<GrowthRule[]> {
    return this.ruleRepository.find({
      relations: ['stages', 'stages.conditions', 'stages.animation_asset'],
      order: {
        created_at: 'ASC',
        stages: {
          stage_order: 'ASC',
          conditions: {
            condition_order: 'ASC',
          },
        },
      },
    });
  }

  async findRuleById(id: string): Promise<GrowthRule> {
    const rule = await this.ruleRepository.findOne({
      where: { id },
      relations: ['stages', 'stages.conditions', 'stages.animation_asset'],
      order: {
        stages: {
          stage_order: 'ASC',
          conditions: {
            condition_order: 'ASC',
          },
        },
      },
    });
    if (!rule) {
      throw new NotFoundException(`GrowthRule with ID ${id} not found`);
    }
    return rule;
  }

  async createRule(dto: CreateGrowthRuleDto): Promise<GrowthRule> {
    this.validateInputDefinitions(dto.input_definitions as InputDefinition[]);

    if (dto.is_default) {
      await this.ruleRepository
        .createQueryBuilder()
        .update(GrowthRule)
        .set({ is_default: false })
        .where('is_default = :isDef', { isDef: true })
        .execute();
    }
    const rule = this.ruleRepository.create({
      name: dto.name,
      description: dto.description,
      is_default: dto.is_default ?? false,
      input_definitions: (dto.input_definitions as InputDefinition[]) || [],
    });
    return this.ruleRepository.save(rule);
  }

  async updateRule(id: string, dto: UpdateGrowthRuleDto): Promise<GrowthRule> {
    const rule = await this.findRuleById(id);
    if (dto.input_definitions !== undefined) {
      this.validateInputDefinitions(dto.input_definitions as InputDefinition[]);
    }
    if (dto.is_default) {
      await this.ruleRepository
        .createQueryBuilder()
        .update(GrowthRule)
        .set({ is_default: false })
        .where('is_default = :isDef', { isDef: true })
        .execute();
    }
    Object.assign(rule, dto);
    return this.ruleRepository.save(rule);
  }

  async deleteRule(id: string): Promise<{ success: boolean; message: string }> {
    const rule = await this.findRuleById(id);
    await this.ruleRepository.remove(rule);
    return {
      success: true,
      message: `GrowthRule '${rule.name}' deleted successfully`,
    };
  }

  // ===========================================================================
  // STAGES CRUD & TIMELINE OVERLAP VALIDATION
  // ===========================================================================

  validateStageTimeline(
    startDay: number,
    endDay: number,
    existingStages: GrowthStage[],
    excludeStageId?: string,
  ) {
    if (startDay > endDay) {
      throw new BadRequestException(
        `Invalid stage range: startDay (${startDay}) cannot be greater than endDay (${endDay}).`,
      );
    }
    if (startDay < 0) {
      throw new BadRequestException('Stage startDay cannot be negative.');
    }

    const otherStages = existingStages.filter((s) => s.id !== excludeStageId);
    for (const s of otherStages) {
      const sStart = s.min_day;
      const sEnd = s.max_day;
      if (!(endDay < sStart || startDay > sEnd)) {
        throw new BadRequestException(
          `Stage timeline range (Day ${startDay}–${endDay}) overlaps with existing stage "${s.stage_name}" (Day ${sStart}–${sEnd}).`,
        );
      }
    }
  }

  /**
   * Validates mandatory stage-level initial_inputs.
   * Every GrowthStage must define a valid initial value for every variable declared
   * in its parent rule's input_definitions — no partial/missing coverage allowed.
   */
  validateStageInitialInputs(
    initialInputs: Record<string, any> | undefined,
    inputDefinitions: InputDefinition[] = [],
    stageName?: string,
  ): Record<string, any> {
    if (!inputDefinitions || inputDefinitions.length === 0) {
      if (initialInputs && Object.keys(initialInputs).length > 0) {
        throw new BadRequestException(
          `Stage "${stageName || 'unnamed'}" cannot define initial_inputs because the parent rule has no declared input_definitions.`,
        );
      }
      return {};
    }

    if (!initialInputs || typeof initialInputs !== 'object' || Array.isArray(initialInputs)) {
      const missingKeys = inputDefinitions.map((d) => d.key);
      throw new BadRequestException(
        `Stage "${stageName || 'unnamed'}" is missing mandatory initial_inputs for declared variables: ${missingKeys.join(', ')}.`,
      );
    }

    const declaredMap = new Map<string, InputDefinition>();
    for (const def of inputDefinitions) {
      declaredMap.set(def.key.toLowerCase().trim(), def);
    }

    const incomingMap = new Map<string, any>();
    for (const [k, v] of Object.entries(initialInputs)) {
      incomingMap.set(k.toLowerCase().trim(), v);
    }

    // 1. Full coverage check: every declared variable must be explicitly defined
    const missingKeys: string[] = [];
    for (const def of inputDefinitions) {
      const keyLower = def.key.toLowerCase().trim();
      if (!incomingMap.has(keyLower) || incomingMap.get(keyLower) === undefined || incomingMap.get(keyLower) === null) {
        missingKeys.push(def.key);
      }
    }
    if (missingKeys.length > 0) {
      throw new BadRequestException(
        `Stage "${stageName || 'unnamed'}" is missing required initial_inputs for: ${missingKeys.join(', ')}. All declared variables must be specified.`,
      );
    }

    // 2. Extra/unknown keys check (typo/orphaned data protection)
    const extraKeys: string[] = [];
    for (const [rawKey] of Object.entries(initialInputs)) {
      if (!declaredMap.has(rawKey.toLowerCase().trim())) {
        extraKeys.push(rawKey);
      }
    }
    if (extraKeys.length > 0) {
      throw new BadRequestException(
        `Stage "${stageName || 'unnamed'}" contains unknown initial_inputs keys: ${extraKeys.join(', ')}. Only declared variables from the parent rule are allowed.`,
      );
    }

    // 3. Value validation per type
    const validatedInputs: Record<string, any> = {};
    for (const def of inputDefinitions) {
      const keyLower = def.key.toLowerCase().trim();
      const val = incomingMap.get(keyLower);

      if (def.type === 'number') {
        const num = typeof val === 'number' ? val : parseFloat(val);
        if (typeof num !== 'number' || isNaN(num)) {
          throw new BadRequestException(
            `Initial value for number variable "${def.key}" in stage "${stageName || 'unnamed'}" must be a valid number.`,
          );
        }
        const min = def.min ?? 0;
        const max = def.max ?? 100;
        if (num < min || num > max) {
          throw new BadRequestException(
            `Initial value (${num}) for variable "${def.key}" in stage "${stageName || 'unnamed'}" must be within range [${min}, ${max}].`,
          );
        }
        validatedInputs[def.key] = num;
      } else if (def.type === 'enum') {
        if (typeof val !== 'string' || val.trim().length === 0) {
          throw new BadRequestException(
            `Initial value for enum variable "${def.key}" in stage "${stageName || 'unnamed'}" must be a non-empty string.`,
          );
        }
        const validEnums = def.enumValues?.map((e) => e.toLowerCase()) || [];
        const strVal = val.trim();
        if (!validEnums.includes(strVal.toLowerCase())) {
          throw new BadRequestException(
            `Initial value "${strVal}" for enum variable "${def.key}" in stage "${stageName || 'unnamed'}" is invalid. Allowed values: ${def.enumValues?.join(', ')}.`,
          );
        }
        const canonical = def.enumValues?.find((e) => e.toLowerCase() === strVal.toLowerCase()) || strVal;
        validatedInputs[def.key] = canonical;
      }
    }

    return validatedInputs;
  }

  async addStage(ruleId: string, dto: CreateGrowthStageDto): Promise<GrowthStage> {
    const rule = await this.findRuleById(ruleId);
    let order = dto.stage_order;
    if (!order) {
      const highest =
        rule.stages?.reduce((max, s) => Math.max(max, s.stage_order), 0) || 0;
      order = highest + 1;
    }

    const startDay = dto.startDay ?? dto.start_day ?? dto.min_day ?? 1;
    const endDay = dto.endDay ?? dto.end_day ?? dto.max_day ?? 15;

    this.validateStageTimeline(startDay, endDay, rule.stages || []);

    const validatedInitialInputs = this.validateStageInitialInputs(
      dto.initial_inputs ?? dto.initialInputs,
      rule.input_definitions,
      dto.stage_name,
    );

    const assetId = dto.animationAssetId ?? dto.animation_asset_id;
    let animationAsset: AnimationAsset | undefined;
    if (assetId) {
      const found = await this.animationAssetRepository.findOne({ where: { id: assetId } });
      if (!found) {
        throw new BadRequestException(`Animation asset with ID "${assetId}" not found.`);
      }
      animationAsset = found;
    }

    const stage = this.stageRepository.create({
      rule_id: rule.id,
      stage_name: dto.stage_name,
      stage_order: order,
      animation_asset_id: animationAsset?.id || null,
      animation_asset: animationAsset,
      animation: animationAsset?.file_url || dto.animation || 'foliage_lush',
      min_day: startDay,
      max_day: endDay,
      initial_inputs: validatedInitialInputs,
    });
    return this.stageRepository.save(stage);
  }

  async updateStage(stageId: string, dto: UpdateGrowthStageDto): Promise<GrowthStage> {
    const stage = await this.stageRepository.findOne({
      where: { id: stageId },
      relations: ['rule', 'rule.stages', 'animation_asset'],
    });
    if (!stage) {
      throw new NotFoundException(`GrowthStage with ID ${stageId} not found`);
    }

    const startDay =
      dto.startDay ?? dto.start_day ?? dto.min_day ?? stage.min_day;
    const endDay = dto.endDay ?? dto.end_day ?? dto.max_day ?? stage.max_day;

    if (stage.rule?.stages) {
      this.validateStageTimeline(startDay, endDay, stage.rule.stages, stageId);
    }

    if (dto.initial_inputs !== undefined || dto.initialInputs !== undefined) {
      const validatedInitialInputs = this.validateStageInitialInputs(
        dto.initial_inputs ?? dto.initialInputs,
        stage.rule?.input_definitions || [],
        dto.stage_name ?? stage.stage_name,
      );
      stage.initial_inputs = validatedInitialInputs;
    }

    if (dto.animationAssetId !== undefined || dto.animation_asset_id !== undefined) {
      const assetId = dto.animationAssetId ?? dto.animation_asset_id;
      if (assetId) {
        const found = await this.animationAssetRepository.findOne({ where: { id: assetId } });
        if (!found) {
          throw new BadRequestException(`Animation asset with ID "${assetId}" not found.`);
        }
        stage.animation_asset_id = found.id;
        stage.animation_asset = found;
        stage.animation = found.file_url;
      } else {
        stage.animation_asset_id = null;
        stage.animation_asset = undefined;
      }
    } else if (dto.animation !== undefined) {
      stage.animation = dto.animation;
    }

    stage.min_day = startDay;
    stage.max_day = endDay;
    if (dto.stage_name !== undefined) stage.stage_name = dto.stage_name;
    if (dto.stage_order !== undefined) stage.stage_order = dto.stage_order;

    return this.stageRepository.save(stage);
  }

  async deleteStage(stageId: string): Promise<{ success: boolean; message: string }> {
    const stage = await this.stageRepository.findOne({ where: { id: stageId } });
    if (!stage) {
      throw new NotFoundException(`GrowthStage with ID ${stageId} not found`);
    }
    await this.stageRepository.remove(stage);
    return {
      success: true,
      message: `Stage '${stage.stage_name}' deleted successfully`,
    };
  }

  // ===========================================================================
  // CONDITIONS CRUD & STRICT WRITE-TIME VALIDATION
  // ===========================================================================

  validateConditionRules(ruleItems: RuleItem[], parentRule: GrowthRule) {
    if (!ruleItems || ruleItems.length === 0) return;

    const declaredMap = new Map<string, InputDefinition>();
    for (const def of parentRule.input_definitions || []) {
      declaredMap.set(def.key.toLowerCase().trim(), def);
    }

    if (declaredMap.size === 0) return;

    for (const item of ruleItems) {
      if (!item.output) {
        throw new BadRequestException('Condition rule item must contain an output object.');
      }

      if (!item.output.statusColor || typeof item.output.statusColor !== 'string') {
        throw new BadRequestException('Condition rule item must contain a mandatory "statusColor" hex code (e.g. #4CAF50).');
      }

      if (!/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(item.output.statusColor.trim())) {
        throw new BadRequestException(
          `Invalid statusColor "${item.output.statusColor}". Must be a valid 6- or 8-digit hex code starting with # (e.g. #4CAF50).`,
        );
      }

      const itemInputs = (item.input || []).map((k) => k.toLowerCase().trim());
      for (const inputKey of itemInputs) {
        if (!declaredMap.has(inputKey)) {
          throw new BadRequestException(
            `Input "${inputKey}" referenced in condition is not declared in parent rule "${parentRule.name}".`,
          );
        }
      }

      const expressions = Array.isArray(item.output.rule)
        ? item.output.rule
        : item.output.rule
          ? [item.output.rule]
          : [];

      for (const expr of expressions) {
        if (!expr) continue;
        const clean = expr.trim();
        const cleanLower = clean.toLowerCase();

        if (
          cleanLower === 'otherwise' ||
          cleanLower === 'default' ||
          cleanLower === '*' ||
          cleanLower === 'true'
        ) {
          continue;
        }

        // 1. Check 'in [...]' operator
        const inMatch = cleanLower.match(/^([a-z_][a-z0-9_]*)\s+in\s*\[([^\]]+)\]$/i);
        if (inMatch) {
          const varName = inMatch[1].toLowerCase();
          const allowedValues = inMatch[2].split(',').map((v) => v.trim());

          if (!itemInputs.includes(varName)) {
            throw new BadRequestException(
              `Variable "${varName}" in expression "${expr}" must be declared in item's "input" array.`,
            );
          }
          const def = declaredMap.get(varName);
          if (!def) {
            throw new BadRequestException(
              `Variable "${varName}" is not declared in parent rule.`,
            );
          }
          if (def.type !== 'enum') {
            throw new BadRequestException(
              `Operator "in [...]" used in "${expr}" is only valid on enum inputs, but "${varName}" is typed as "${def.type}".`,
            );
          }
          const validEnumValues = def.enumValues?.map((v) => v.toLowerCase()) || [];
          for (const val of allowedValues) {
            if (!validEnumValues.includes(val.toLowerCase())) {
              throw new BadRequestException(
                `Enum value "${val}" in expression "${expr}" is not in declared enumValues for "${def.key}" (allowed: ${def.enumValues?.join(', ')}).`,
              );
            }
          }
          continue;
        }

        // 2. Check 'between' operator
        const betweenMatch = cleanLower.match(
          /^([a-z_][a-z0-9_]*)\s+between\s+([a-z0-9_.-]+)\s+and\s+([a-z0-9_.-]+)$/i,
        );
        if (betweenMatch) {
          const varName = betweenMatch[1].toLowerCase();
          if (!itemInputs.includes(varName)) {
            throw new BadRequestException(
              `Variable "${varName}" in expression "${expr}" must be declared in item's "input" array.`,
            );
          }
          const def = declaredMap.get(varName);
          if (!def) {
            throw new BadRequestException(
              `Variable "${varName}" is not declared in parent rule.`,
            );
          }
          if (def.type !== 'number') {
            throw new BadRequestException(
              `Operator "between" used in "${expr}" is only valid on number inputs, but "${varName}" is typed as "${def.type}".`,
            );
          }
          const minNum = parseFloat(betweenMatch[2]);
          const maxNum = parseFloat(betweenMatch[3]);
          if (isNaN(minNum) || isNaN(maxNum)) {
            throw new BadRequestException(
              `"between" operator in "${expr}" requires numeric range boundaries.`,
            );
          }
          continue;
        }

        // 3. Check comparison operator: >=, <=, !=, <>, ==, =, >, <
        const compMatch = clean.match(
          /^([a-z0-9_.-]+)\s*(>=|<=|!=|<>|==|=|>|<)\s*([a-z0-9_.-]+)$/i,
        );
        if (compMatch) {
          const lhsRaw = compMatch[1].toLowerCase();
          const op = compMatch[2];
          const rhsRaw = compMatch[3];

          if (declaredMap.has(lhsRaw)) {
            if (!itemInputs.includes(lhsRaw)) {
              throw new BadRequestException(
                `Variable "${lhsRaw}" in expression "${expr}" must be listed in condition item's "input" array.`,
              );
            }
            const def = declaredMap.get(lhsRaw)!;
            if (def.type === 'enum') {
              if (op !== '==' && op !== '=' && op !== '!=' && op !== '<>') {
                throw new BadRequestException(
                  `Numeric comparison operator "${op}" in "${expr}" cannot be used on enum variable "${def.key}". Use "==" or "!=" or "in [...]".`,
                );
              }
              const rhsLower = rhsRaw.toLowerCase();
              const validEnums = def.enumValues?.map((v) => v.toLowerCase()) || [];
              if (!validEnums.includes(rhsLower)) {
                throw new BadRequestException(
                  `Enum value "${rhsRaw}" in expression "${expr}" is not a valid state for "${def.key}" (allowed: ${def.enumValues?.join(', ')}).`,
                );
              }
            } else if (def.type === 'number') {
              if (declaredMap.has(rhsRaw.toLowerCase())) {
                const rhsDef = declaredMap.get(rhsRaw.toLowerCase())!;
                if (rhsDef.type !== 'number') {
                  throw new BadRequestException(
                    `Cannot compare number variable "${def.key}" with enum variable "${rhsDef.key}" in "${expr}".`,
                  );
                }
              } else {
                const num = parseFloat(rhsRaw);
                if (isNaN(num)) {
                  throw new BadRequestException(
                    `Right hand operand "${rhsRaw}" in expression "${expr}" must be a valid number.`,
                  );
                }
              }
            }
          }
        }
      }
    }
  }

  async addCondition(
    stageId: string,
    dto: CreateGrowthConditionDto,
  ): Promise<GrowthCondition> {
    const stage = await this.stageRepository.findOne({
      where: { id: stageId },
      relations: ['conditions', 'rule'],
    });
    if (!stage) {
      throw new NotFoundException(`GrowthStage with ID ${stageId} not found`);
    }

    if (stage.rule) {
      this.validateConditionRules(dto.rules as RuleItem[], stage.rule);
    }

    let order = dto.condition_order;
    if (!order) {
      const highest =
        stage.conditions?.reduce((max, c) => Math.max(max, c.condition_order), 0) ||
        0;
      order = highest + 1;
    }

    let conditionInputs = dto.inputs || [];
    if (conditionInputs.length === 0 && dto.rules) {
      const inputSet = new Set<string>();
      for (const r of dto.rules) {
        if (Array.isArray(r.input)) {
          r.input.forEach((k) => inputSet.add(k));
        }
      }
      conditionInputs = Array.from(inputSet);
    }

    const condition = this.conditionRepository.create({
      stage_id: stage.id,
      name: dto.name,
      condition_order: order,
      inputs: conditionInputs,
      rules: (dto.rules as RuleItem[]) || [],
      outputs: dto.outputs || [],
    });
    return this.conditionRepository.save(condition);
  }

  async updateCondition(
    conditionId: string,
    dto: UpdateGrowthConditionDto,
  ): Promise<GrowthCondition> {
    const condition = await this.conditionRepository.findOne({
      where: { id: conditionId },
      relations: ['stage', 'stage.rule'],
    });
    if (!condition) {
      throw new NotFoundException(`GrowthCondition with ID ${conditionId} not found`);
    }

    if (dto.rules && condition.stage?.rule) {
      this.validateConditionRules(dto.rules as RuleItem[], condition.stage.rule);
    }

    Object.assign(condition, dto);
    return this.conditionRepository.save(condition);
  }

  async deleteCondition(
    conditionId: string,
  ): Promise<{ success: boolean; message: string }> {
    const condition = await this.conditionRepository.findOne({
      where: { id: conditionId },
    });
    if (!condition) {
      throw new NotFoundException(`GrowthCondition with ID ${conditionId} not found`);
    }
    await this.conditionRepository.remove(condition);
    return {
      success: true,
      message: `Condition '${condition.name}' deleted successfully`,
    };
  }

  // ===========================================================================
  // ANIMATION ASSET MANAGEMENT
  // ===========================================================================

  async uploadAnimation(
    name: string,
    file: Express.Multer.File,
  ): Promise<AnimationAsset> {
    if (!file) {
      throw new BadRequestException('Animation asset file is required');
    }
    const ext = extname(file.originalname).toLowerCase() || '.json';
    const allowedExtensions = ['.json', '.svg', '.gif', '.mp4', '.webm', '.png', '.webp'];
    if (!allowedExtensions.includes(ext)) {
      throw new BadRequestException(
        `Invalid file type "${ext}". Supported animation formats: Lottie JSON (.json), SVG (.svg), GIF (.gif), MP4/WebM (.mp4, .webm).`,
      );
    }

    let uploadBuffer = file.buffer;
    let mimeType = file.mimetype || 'application/json';

    if (ext === '.svg') {
      mimeType = 'image/svg+xml';
      // Sanitize SVG: strip script tags
      let svgStr = file.buffer.toString('utf8');
      svgStr = svgStr.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      uploadBuffer = Buffer.from(svgStr, 'utf8');
    } else if (ext === '.json') {
      mimeType = 'application/json';
      try {
        JSON.parse(file.buffer.toString('utf8'));
      } catch (err) {
        throw new BadRequestException('Invalid JSON content in animation asset file.');
      }
    }

    const key = `${randomUUID()}${ext}`;
    const fileUrl = await this.supabaseStorageService.uploadFile(
      'animations',
      key,
      uploadBuffer,
      mimeType,
    );

    const asset = this.animationAssetRepository.create({
      name: name || file.originalname,
      file_url: fileUrl,
      file_type: ext.replace('.', ''),
    });
    return this.animationAssetRepository.save(asset);
  }

  async findAllAnimations(): Promise<AnimationAsset[]> {
    return this.animationAssetRepository.find({
      order: { created_at: 'DESC' },
    });
  }

  async deleteAnimation(id: string): Promise<{ success: boolean; message: string }> {
    const asset = await this.animationAssetRepository.findOne({ where: { id } });
    if (!asset) {
      throw new NotFoundException(`AnimationAsset with ID ${id} not found`);
    }
    if (asset.file_url) {
      await this.storageCleanupService.deleteFileByUrl(asset.file_url);
    }
    await this.animationAssetRepository.remove(asset);
    return {
      success: true,
      message: `Animation asset '${asset.name}' deleted successfully`,
    };
  }

  async bulkDeleteAnimations(ids: string[], adminId: string): Promise<BulkDeleteResult> {
    const succeededIds: string[] = [];
    const failedItems: FailedItem[] = [];
    const filesToClean: string[] = [];

    await this.animationAssetRepository.manager.transaction(async (manager) => {
      const existing = await manager.find(AnimationAsset, {
        where: { id: In(ids) },
      });

      const foundMap = new Map(existing.map((a) => [a.id, a]));

      for (const id of ids) {
        const asset = foundMap.get(id);
        if (!asset) {
          failedItems.push({ id, reason: `AnimationAsset with ID ${id} not found` });
          continue;
        }

        try {
          if (asset.file_url) filesToClean.push(asset.file_url);
          await manager.delete(AnimationAsset, { id });
          succeededIds.push(id);
        } catch (err) {
          failedItems.push({
            id,
            reason: err instanceof Error ? err.message : 'Database error during animation asset deletion',
          });
        }
      }
    });

    if (filesToClean.length > 0) {
      this.storageCleanupService.deleteFilesByUrls(filesToClean).catch((err) => {
        this.logger.warn(`Storage cleanup failed for bulk deleted animations: ${err}`);
      });
    }

    const auditStatus =
      failedItems.length === 0
        ? AuditStatus.SUCCESS
        : succeededIds.length > 0
        ? AuditStatus.PARTIAL
        : AuditStatus.FAILED;

    await this.auditLogService.logAction({
      adminId,
      action: 'BULK_DELETE_ANIMATION_ASSETS',
      targetType: 'animation_assets',
      targetIds: succeededIds,
      details: {
        totalRequested: ids.length,
        succeededCount: succeededIds.length,
        failedCount: failedItems.length,
        failedItems,
      },
      status: auditStatus,
    });

    return {
      totalRequested: ids.length,
      succeededCount: succeededIds.length,
      failedCount: failedItems.length,
      succeededIds,
      failedItems,
      action: 'BULK_DELETE_ANIMATION_ASSETS',
    };
  }

  // ===========================================================================
  // SIMULATION & EVALUATION ENGINE
  // ===========================================================================

  async simulateProduct(
    productId: string,
    dto: SimulateGrowthDto,
  ): Promise<SimulationResult> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: ['growth_rule'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    let rule: GrowthRule | null = null;
    const targetRuleId = product.rule_id || product.growth_rule?.id;
    if (targetRuleId) {
      rule = await this.findRuleById(targetRuleId);
    }

    if (!rule) {
      rule = await this.ruleRepository
        .createQueryBuilder('rule')
        .leftJoinAndSelect('rule.stages', 'stage')
        .leftJoinAndSelect('stage.conditions', 'condition')
        .leftJoinAndSelect('stage.animation_asset', 'animation_asset')
        .where('rule.is_default = true')
        .orderBy('stage.stage_order', 'ASC')
        .addOrderBy('condition.condition_order', 'ASC')
        .getOne();

      if (!rule) {
        rule = await this.ruleRepository
          .createQueryBuilder('rule')
          .leftJoinAndSelect('rule.stages', 'stage')
          .leftJoinAndSelect('stage.conditions', 'condition')
          .leftJoinAndSelect('stage.animation_asset', 'animation_asset')
          .orderBy('rule.created_at', 'ASC')
          .addOrderBy('stage.stage_order', 'ASC')
          .addOrderBy('condition.condition_order', 'ASC')
          .getOne();
      }
    }

    const result = await this.evaluateSimulation(
      rule,
      dto,
      product.harvest_days || 60,
    );
    result.productId = product.id;
    result.productName = product.name;
    return result;
  }

  async simulateDirect(dto: SimulateGrowthDto): Promise<SimulationResult> {
    let rule: GrowthRule | null = null;
    if (dto.ruleId) {
      rule = await this.findRuleById(dto.ruleId);
    } else {
      rule = await this.ruleRepository.findOne({
        where: { is_default: true },
        relations: ['stages', 'stages.conditions', 'stages.animation_asset'],
        order: {
          stages: { stage_order: 'ASC', conditions: { condition_order: 'ASC' } },
        },
      });
      if (!rule) {
        rule = await this.ruleRepository.findOne({
          relations: ['stages', 'stages.conditions', 'stages.animation_asset'],
          order: {
            created_at: 'ASC',
            stages: { stage_order: 'ASC', conditions: { condition_order: 'ASC' } },
          },
        });
      }
    }

    return this.evaluateSimulation(rule, dto, 60);
  }

  /**
   * Core rule evaluation algorithm.
   */
  private async evaluateSimulation(
    rule: GrowthRule | null,
    dto: SimulateGrowthDto,
    totalHarvestDays: number,
  ): Promise<SimulationResult> {
    // 1. Build unified incoming inputs map & extract cultivationDay
    const incomingInputs: Record<string, any> = { ...(dto.inputs || {}) };

    if (dto.water !== undefined && incomingInputs.water === undefined)
      incomingInputs.water = dto.water;
    if (dto.sunlight !== undefined && incomingInputs.sunlight === undefined)
      incomingInputs.sunlight = dto.sunlight;
    if (dto.temperature !== undefined && incomingInputs.temperature === undefined)
      incomingInputs.temperature = dto.temperature;
    if (dto.ph !== undefined && incomingInputs.ph === undefined)
      incomingInputs.ph = dto.ph;
    if (dto.n !== undefined && incomingInputs.n === undefined) incomingInputs.n = dto.n;
    if (dto.p !== undefined && incomingInputs.p === undefined) incomingInputs.p = dto.p;
    if (dto.k !== undefined && incomingInputs.k === undefined) incomingInputs.k = dto.k;
    if (dto.day !== undefined && incomingInputs.day === undefined)
      incomingInputs.day = dto.day;
    if (dto.cultivationDay !== undefined && incomingInputs.day === undefined)
      incomingInputs.day = dto.cultivationDay;

    const currentDay =
      dto.cultivationDay !== undefined
        ? Number(dto.cultivationDay)
        : incomingInputs.day !== undefined
          ? Number(incomingInputs.day)
          : dto.day !== undefined
            ? Number(dto.day)
            : 15;

    // 2. Resolve Active Stage strictly by: startDay <= cultivationDay <= endDay
    let activeStage: GrowthStage | undefined;
    const stages = (rule?.stages || []).sort((a, b) => a.stage_order - b.stage_order);

    if (dto.stageId) {
      activeStage = stages.find((s) => s.id === dto.stageId);
    } else if (stages.length > 0) {
      activeStage = stages.find(
        (s) => currentDay >= s.min_day && currentDay <= s.max_day,
      );
    }

    // 3. Normalize context based on declared input_definitions and activeStage.initial_inputs
    const context: Record<string, any> = { day: currentDay };

    if (rule?.input_definitions && rule.input_definitions.length > 0) {
      for (const def of rule.input_definitions) {
        const keyLower = def.key.toLowerCase();
        const raw = incomingInputs[def.key] ?? incomingInputs[keyLower];

        if (def.type === 'number') {
          // Resolve min/max with fallback and logging for legacy rules
          let minVal = def.min;
          let maxVal = def.max;
          if (
            minVal === undefined ||
            maxVal === undefined ||
            isNaN(minVal) ||
            isNaN(maxVal) ||
            minVal >= maxVal
          ) {
            minVal = 0;
            maxVal = 100;
            this.logger.warn(
              `GrowthRule "${rule?.id || 'unknown'}" number input "${def.key}" lacks valid min/max bounds. Falling back to default range [0, 100].`,
            );
          }

          let num: number;
          if (raw === undefined || raw === null) {
            // Level 1 (Primary): activeStage.initial_inputs
            const stageVal =
              activeStage?.initial_inputs?.[def.key] ??
              activeStage?.initial_inputs?.[keyLower];

            if (stageVal !== undefined && stageVal !== null && !isNaN(Number(stageVal))) {
              num = Number(stageVal);
            } else {
              // Level 2 (Defensive fallback for legacy stages): def.default / minVal
              this.logger.warn(
                `GrowthStage "${activeStage?.id || 'unknown'}" missing initial_input for variable "${def.key}". Falling back to authored default/min.`,
              );
              num =
                typeof def.default === 'number' && !isNaN(def.default)
                  ? def.default
                  : minVal;
            }
          } else {
            num = Number(raw);
            if (Number.isNaN(num)) {
              const stageVal =
                activeStage?.initial_inputs?.[def.key] ??
                activeStage?.initial_inputs?.[keyLower];
              num =
                stageVal !== undefined && !isNaN(Number(stageVal))
                  ? Number(stageVal)
                  : typeof def.default === 'number' && !isNaN(def.default)
                    ? def.default
                    : minVal;
            }
          }

          // Actively clamp incoming numeric values to [minVal, maxVal]
          context[keyLower] = Math.min(Math.max(num, minVal), maxVal);
        } else {
          // Enum input: single string value
          const validEnums = def.enumValues?.map((e) => e.toLowerCase()) || [];
          let selectedStr: string | null = null;

          if (raw === undefined || raw === null) {
            // Level 1 (Primary): activeStage.initial_inputs
            const stageVal =
              activeStage?.initial_inputs?.[def.key] ??
              activeStage?.initial_inputs?.[keyLower];

            if (
              typeof stageVal === 'string' &&
              validEnums.includes(stageVal.trim().toLowerCase())
            ) {
              selectedStr = stageVal.trim();
            } else {
              // Level 2 (Defensive fallback for legacy stages)
              this.logger.warn(
                `GrowthStage "${activeStage?.id || 'unknown'}" missing initial_input for enum variable "${def.key}". Falling back to authored default/first option.`,
              );
              selectedStr =
                typeof def.default === 'string' &&
                validEnums.includes(def.default.trim().toLowerCase())
                  ? def.default.trim()
                  : def.enumValues && def.enumValues.length > 0
                    ? def.enumValues[0]
                    : '';
            }
          } else if (Array.isArray(raw)) {
            this.logger.warn(
              `GrowthRule "${rule?.id || 'unknown'}" enum input "${def.key}" received legacy array payload: ${JSON.stringify(raw)}. Using first valid entry.`,
            );
            for (const item of raw) {
              const str = String(item).trim();
              if (validEnums.includes(str.toLowerCase())) {
                selectedStr = str;
                break;
              }
            }
            if (!selectedStr) {
              const stageVal =
                activeStage?.initial_inputs?.[def.key] ??
                activeStage?.initial_inputs?.[keyLower];
              selectedStr =
                typeof stageVal === 'string' &&
                validEnums.includes(stageVal.trim().toLowerCase())
                  ? stageVal.trim()
                  : typeof def.default === 'string' &&
                    validEnums.includes(def.default.trim().toLowerCase())
                    ? def.default.trim()
                    : def.enumValues && def.enumValues.length > 0
                      ? def.enumValues[0]
                      : '';
            }
          } else {
            const str = String(raw).trim();
            if (validEnums.includes(str.toLowerCase())) {
              selectedStr = str;
            } else {
              this.logger.warn(
                `GrowthRule "${rule?.id || 'unknown'}" enum input "${def.key}" received invalid enum value "${str}" (expected one of: ${def.enumValues?.join(', ')}). Falling back to stage/default.`,
              );
              const stageVal =
                activeStage?.initial_inputs?.[def.key] ??
                activeStage?.initial_inputs?.[keyLower];
              selectedStr =
                typeof stageVal === 'string' &&
                validEnums.includes(stageVal.trim().toLowerCase())
                  ? stageVal.trim()
                  : typeof def.default === 'string' &&
                    validEnums.includes(def.default.trim().toLowerCase())
                    ? def.default.trim()
                    : def.enumValues && def.enumValues.length > 0
                      ? def.enumValues[0]
                      : '';
            }
          }

          context[keyLower] = selectedStr;
        }
      }
    } else {
      // Fallback defaults for legacy rules without explicit schema
      for (const [k, v] of Object.entries(incomingInputs)) {
        if (Array.isArray(v)) {
          context[k.toLowerCase()] = v.length > 0 ? v[0] : '';
        } else {
          const num = Number(v);
          context[k.toLowerCase()] = !Number.isNaN(num) ? num : v;
        }
      }
    }

    // Explicit "No Active Stage" result if day is outside any declared stage
    if (!activeStage) {
      return {
        ruleId: rule?.id || 'default-rule',
        ruleName: rule?.name || 'Standard Botanical Growth Model',
        stage: {
          name: 'NO_ACTIVE_STAGE',
          order: 0,
          animation: 'foliage_lush',
          minDay: currentDay,
          maxDay: currentDay,
          startDay: currentDay,
          endDay: currentDay,
        },
        hasActiveStage: false,
        cultivationDay: currentDay,
        inputs: context,
        conditionResults: [],
        animation: 'foliage_lush',
        animationAssetUrl: null,
      };
    }

    // Resolve stage default animation asset URL (via joined relation, DB lookup, or HTTP URL)
    let stageDefaultAssetUrl: string | null = activeStage.animation_asset?.file_url || null;
    if (!stageDefaultAssetUrl && activeStage.animation_asset_id) {
      const asset = await this.animationAssetRepository.findOne({ where: { id: activeStage.animation_asset_id } });
      if (asset) {
        stageDefaultAssetUrl = asset.file_url;
      }
    }
    if (!stageDefaultAssetUrl && activeStage.animation?.startsWith('http')) {
      stageDefaultAssetUrl = activeStage.animation;
    }

    const stageInfo = {
      id: activeStage.id,
      name: activeStage.stage_name,
      order: activeStage.stage_order,
      animation: stageDefaultAssetUrl || activeStage.animation || 'foliage_lush',
      animationAssetId: activeStage.animation_asset_id || undefined,
      animationAssetUrl: stageDefaultAssetUrl,
      minDay: activeStage.min_day,
      maxDay: activeStage.max_day,
      startDay: activeStage.min_day,
      endDay: activeStage.max_day,
    };

    // 4. Evaluate ONLY the rules belonging to the active stage
    const conditionResults: ConditionEvaluationResult[] = [];
    const rawConditions = (activeStage.conditions || []).sort(
      (a, b) => a.condition_order - b.condition_order,
    );

    for (const condition of rawConditions) {
      const result = this.evaluateSingleCondition(condition, context);
      conditionResults.push(result);
    }

    // 5. Batch resolve animation assets for matched conditions
    const assetIds = conditionResults
      .map((cr) => cr.animationAssetId)
      .filter((id): id is string => !!id);

    if (assetIds.length > 0) {
      const assets = await this.animationAssetRepository.find({
        where: { id: In(assetIds) },
      });
      const assetMap = new Map<string, string>(assets.map((a) => [a.id, a.file_url]));
      for (const cr of conditionResults) {
        if (cr.animationAssetId && assetMap.has(cr.animationAssetId)) {
          cr.animationAssetUrl = assetMap.get(cr.animationAssetId);
        }
      }
    }

    // 6. Dominant condition selection for stage-level animation:
    // Without severity-ranking, precedence is controlled purely by declared author order.
    // Iterating conditionResults in the order of the stage's conditions (sorted by condition_order),
    // we take the FIRST condition that resolved to an animation asset, falling back to the stage default.
    const animationAssetUrl = conditionResults.find((cr) => !!cr.animationAssetUrl)?.animationAssetUrl
      ?? stageDefaultAssetUrl
      ?? null;

    const finalAnimation = animationAssetUrl || activeStage.animation || 'foliage_lush';

    return {
      ruleId: rule?.id || 'default-rule',
      ruleName: rule?.name || 'Standard Botanical Growth Model',
      stage: stageInfo,
      hasActiveStage: true,
      cultivationDay: currentDay,
      inputs: context,
      conditionResults,
      animation: finalAnimation,
      animationAssetUrl,
    };
  }

  /**
   * Evaluates a single dynamic GrowthCondition against the context variables.
   * Explicit rules are evaluated first. An empty output.rule [] acts as fallback otherwise.
   */
  private evaluateSingleCondition(
    condition: GrowthCondition,
    context: Record<string, any>,
  ): ConditionEvaluationResult {
    const inputsUsed: Record<string, any> = {};
    for (const key of condition.inputs || []) {
      if (typeof key === 'string') {
        const k = key.toLowerCase().trim();
        if (context[k] !== undefined) {
          inputsUsed[k] = context[k];
        }
      }
    }

    let rawRules: any[] = [];
    if (Array.isArray(condition.rules)) {
      rawRules = condition.rules;
    } else if (condition.rules && typeof condition.rules === 'object') {
      rawRules = Object.values(condition.rules);
    }

    let matchedItem: RuleItem | null = null;
    let fallbackItem: RuleItem | null = null;

    for (const ruleItem of rawRules) {
      if (!ruleItem) continue;

      const exprList: string[] = Array.isArray(ruleItem.output?.rule)
        ? ruleItem.output.rule
        : ruleItem.output?.rule
          ? [ruleItem.output.rule]
          : ruleItem.expression
            ? [ruleItem.expression]
            : [];

      // Check if this ruleItem is an empty-rule fallback / otherwise
      const isFallback =
        exprList.length === 0 ||
        (exprList.length === 1 &&
          ['otherwise', 'default', '*', 'true'].includes(exprList[0].trim().toLowerCase()));

      const statusColor =
        ruleItem.output?.statusColor ||
        ruleItem.statusColor ||
        '#4CAF50';

      const animAssetId =
        ruleItem.output?.animationAssetId ||
        ruleItem.animationAssetId;

      if (isFallback) {
        if (!fallbackItem) {
          fallbackItem = {
            input: ruleItem.input || condition.inputs || [],
            output: {
              rule: [],
              to: ruleItem.output?.to || ruleItem.description || ruleItem.output || 'Condition in equilibrium',
              statusColor,
              animationAssetId: animAssetId,
            },
          };
        }
        continue;
      }

      // Explicit rule: all expressions must evaluate to true (AND logic)
      const allMatch = exprList.every((expr: string) =>
        this.evaluateExpression(expr, context),
      );

      if (allMatch) {
        matchedItem = {
          input: ruleItem.input || condition.inputs || [],
          output: {
            rule: exprList,
            to: ruleItem.output?.to || ruleItem.description || ruleItem.output || 'Condition matched',
            statusColor,
            animationAssetId: animAssetId,
          },
        };
        break;
      }
    }

    // If no explicit rule matched, use fallback item
    if (!matchedItem && fallbackItem) {
      matchedItem = fallbackItem;
    }

    if (matchedItem) {
      const exprList = matchedItem.output.rule;
      const matchedText = exprList.length > 0 ? exprList.join(' AND ') : 'otherwise';

      return {
        conditionId: condition.id,
        conditionName: condition.name || 'Condition',
        inputs: inputsUsed,
        matchedRule: matchedText,
        to: matchedItem.output.to,
        statusColor: matchedItem.output.statusColor || '#4CAF50',
        animationAssetId: matchedItem.output.animationAssetId,
      };
    }

    return {
      conditionId: condition.id,
      conditionName: condition.name || 'Condition',
      inputs: inputsUsed,
      matchedRule: 'otherwise',
      to: 'Condition in equilibrium',
      statusColor: '#9E9E9E',
    };
  }

  /**
   * Generic expression evaluator for condition rules.
   * Supports:
   *  - Multi-select enum sets: 'weather in [rainy, stormy]', 'weather == rainy', 'weather != clear'
   *  - Numeric ranges: 'variable between min and max'
   *  - Numeric comparisons: 'variable > number', 'variable <= number', etc.
   *  - Compound AND: 'expr1 && expr2' or 'expr1 and expr2'
   *  - Compound OR: 'expr1 || expr2' or 'expr1 or expr2'
   */
  public evaluateExpression(
    expr: string,
    context: Record<string, any>,
  ): boolean {
    if (!expr) return true;
    const clean = expr.trim();
    const cleanLower = clean.toLowerCase();

    if (
      cleanLower === 'otherwise' ||
      cleanLower === 'default' ||
      cleanLower === '*' ||
      cleanLower === 'true' ||
      cleanLower === ''
    ) {
      return true;
    }

    // Handle compound AND expressions (outside between)
    if (cleanLower.includes(' and ') && !cleanLower.includes(' between ')) {
      const parts = clean.split(/ and /i);
      return parts.every((p) => this.evaluateExpression(p, context));
    }
    if (clean.includes('&&')) {
      const parts = clean.split('&&');
      return parts.every((p) => this.evaluateExpression(p, context));
    }

    // Handle compound OR expressions
    if (cleanLower.includes(' or ') || clean.includes('||')) {
      const parts = clean.split(/ or |\|\|/i);
      return parts.some((p) => this.evaluateExpression(p, context));
    }

    // 1. Handle 'in [...]' enum operator
    const inMatch = cleanLower.match(/^([a-z_][a-z0-9_]*)\s+in\s*\[([^\]]+)\]$/i);
    if (inMatch) {
      const varName = inMatch[1].toLowerCase();
      const allowedValues = inMatch[2].split(',').map((v) => v.trim().toLowerCase());
      const currentValue = context[varName];

      if (typeof currentValue === 'string') {
        return allowedValues.includes(currentValue.toLowerCase());
      }
      if (Array.isArray(currentValue)) {
        return currentValue.some((v) => allowedValues.includes(String(v).toLowerCase()));
      }
      return false;
    }

    // 2. Handle 'between' numeric range
    const betweenMatch = cleanLower.match(
      /^([a-z_][a-z0-9_]*)\s+between\s+([\d.-]+)\s+and\s+([\d.-]+)$/i,
    );
    if (betweenMatch) {
      const varName = betweenMatch[1].toLowerCase();
      const minVal = parseFloat(betweenMatch[2]);
      const maxVal = parseFloat(betweenMatch[3]);
      const val = context[varName];
      if (typeof val !== 'number') return false;
      return val >= minVal && val <= maxVal;
    }

    // 3. Handle comparisons: '>=', '<=', '!=', '<>', '==', '=', '>', '<'
    const compMatch = clean.match(
      /^([a-z0-9_.-]+)\s*(>=|<=|!=|<>|==|=|>|<)\s*([a-z0-9_.-]+)$/i,
    );
    if (!compMatch) {
      this.logger.warn(`Could not parse expression format: "${expr}"`);
      return false;
    }

    const lhsKey = compMatch[1].toLowerCase();
    const op = compMatch[2];
    const rhsRaw = compMatch[3];

    // Resolve LHS
    const lhsVal =
      context[lhsKey] !== undefined
        ? context[lhsKey]
        : !isNaN(parseFloat(lhsKey))
          ? parseFloat(lhsKey)
          : lhsKey;

    // Resolve RHS
    const rhsLower = rhsRaw.toLowerCase();
    const rhsVal =
      context[rhsLower] !== undefined
        ? context[rhsLower]
        : !isNaN(parseFloat(rhsRaw))
          ? parseFloat(rhsRaw)
          : rhsRaw;

    // Numeric comparison
    if (typeof lhsVal === 'number' && typeof rhsVal === 'number') {
      switch (op) {
        case '>':
          return lhsVal > rhsVal;
        case '<':
          return lhsVal < rhsVal;
        case '>=':
          return lhsVal >= rhsVal;
        case '<=':
          return lhsVal <= rhsVal;
        case '==':
        case '=':
          return Math.abs(lhsVal - rhsVal) < 0.0001;
        case '!=':
        case '<>':
          return Math.abs(lhsVal - rhsVal) >= 0.0001;
        default:
          return false;
      }
    } else {
      // String / Enum comparison (direct equality semantics)
      const lhsStr = String(lhsVal).toLowerCase();
      const rhsStr = String(rhsVal).toLowerCase();
      switch (op) {
        case '==':
        case '=':
          return lhsStr === rhsStr;
        case '!=':
        case '<>':
          return lhsStr !== rhsStr;
        default:
          return false;
      }
    }
  }
}
