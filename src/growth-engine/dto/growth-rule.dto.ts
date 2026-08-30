import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsIn,
  Matches,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class InputDefinitionDto {
  @ApiProperty({
    description: 'Variable identifier key (e.g. wind, season, moisture)',
    example: 'wind',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z][a-z0-9_]*$/i, {
    message:
      'key must match safe identifier pattern (start with a letter, alphanumeric and underscores only)',
  })
  key: string;

  @ApiProperty({
    description: 'Data type of input variable',
    enum: ['number', 'enum'],
    example: 'number',
  })
  @IsIn(['number', 'enum'], {
    message: "type must be either 'number' or 'enum'",
  })
  type: 'number' | 'enum';

  @ApiPropertyOptional({
    description: 'Minimum value for number input (required when type === "number")',
    example: 0,
  })
  @IsOptional()
  @IsNumber()
  min?: number;

  @ApiPropertyOptional({
    description: 'Maximum value for number input (required when type === "number")',
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  max?: number;

  @ApiPropertyOptional({
    description: 'Default value for input (number for "number" type, string for "enum" type)',
    example: 50,
  })
  @IsOptional()
  default?: number | string;

  @ApiPropertyOptional({
    description:
      "Closed set of string values (required and only allowed when type === 'enum')",
    example: ['dry', 'rainy', 'stormy', 'windy'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enumValues?: string[];
}

export class CreateGrowthRuleDto {
  @ApiProperty({
    description: 'Rule name',
    example: 'Standard Botanical Growth Model',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Rule description',
    example: 'Default multi-stage growth engine model',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Whether this rule is the global fallback default',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  is_default?: boolean;

  @ApiPropertyOptional({
    description: 'List of rule-level declared input variables',
    type: [InputDefinitionDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InputDefinitionDto)
  input_definitions?: InputDefinitionDto[];
}

export class UpdateGrowthRuleDto {
  @ApiPropertyOptional({ description: 'Rule name' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Rule description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Whether this rule is the global fallback default',
  })
  @IsBoolean()
  @IsOptional()
  is_default?: boolean;

  @ApiPropertyOptional({
    description: 'List of rule-level declared input variables',
    type: [InputDefinitionDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InputDefinitionDto)
  input_definitions?: InputDefinitionDto[];
}
