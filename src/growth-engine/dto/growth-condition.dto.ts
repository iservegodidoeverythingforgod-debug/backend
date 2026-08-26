import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsArray,
  Min,
  ValidateNested,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RuleItemOutputDto {
  @ApiProperty({
    description: 'Array of condition expressions, ANDed together',
    example: ['wind > 70', 'season in [rainy, stormy]'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  rule: string[];

  @ApiProperty({
    description: 'Free-form author-supplied description/tip',
    example: 'Broken stems from severe wind',
  })
  @IsString()
  @IsNotEmpty()
  to: string;

  @ApiProperty({
    description: 'Mandatory status color in 6-digit or 8-digit hex format (e.g. #4CAF50, #F44336)',
    example: '#4CAF50',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/, {
    message: 'statusColor must be a valid 6-digit or 8-digit hex code starting with # (e.g. #4CAF50)',
  })
  statusColor: string;

  @ApiPropertyOptional({
    description: 'Optional animation asset ID reference',
    example: 'd0000000-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsString()
  animationAssetId?: string;
}

export class RuleItemDto {
  @ApiProperty({
    description:
      'Subset of parent rule input keys referenced by this condition item',
    example: ['wind', 'season'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  input: string[];

  @ApiProperty({
    description: 'Condition expression array, author output text, and status color',
    type: RuleItemOutputDto,
  })
  @ValidateNested()
  @Type(() => RuleItemOutputDto)
  output: RuleItemOutputDto;

  @ApiPropertyOptional({
    description: 'Optional animation asset ID reference (convenience at item level)',
    example: 'd0000000-0000-0000-0000-000000000001',
  })
  @IsOptional()
  @IsString()
  animationAssetId?: string;
}

export class CreateGrowthConditionDto {
  @ApiProperty({
    description: 'Condition name',
    example: 'Moisture vs pH Equilibrium',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Order of evaluation', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  condition_order?: number;

  @ApiPropertyOptional({
    description: 'Array of input parameter keys used by this condition',
    example: ['wind', 'season'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inputs?: string[];

  @ApiProperty({
    description: 'List of rule items with typed expressions and author output',
    type: [RuleItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleItemDto)
  rules: RuleItemDto[];

  @ApiPropertyOptional({
    description: 'List of possible output keys produced by this condition',
    type: [String],
  })
  @IsArray()
  @IsOptional()
  outputs?: string[];
}

export class UpdateGrowthConditionDto {
  @ApiPropertyOptional({ description: 'Condition name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Order of evaluation' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  condition_order?: number;

  @ApiPropertyOptional({
    description: 'Array of input parameter keys used by this condition',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  inputs?: string[];

  @ApiPropertyOptional({
    description: 'List of rule items with typed expressions and author output',
    type: [RuleItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleItemDto)
  rules?: RuleItemDto[];

  @ApiPropertyOptional({
    description: 'List of possible output keys produced by this condition',
    type: [String],
  })
  @IsArray()
  @IsOptional()
  outputs?: string[];
}
