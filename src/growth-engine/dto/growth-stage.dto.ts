import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsUUID, IsObject } from 'class-validator';

export class CreateGrowthStageDto {
  @ApiProperty({ description: 'Stage name', example: 'Vegetative' })
  @IsString()
  @IsNotEmpty()
  stage_name: string;

  @ApiPropertyOptional({ description: 'Sequential order index of this stage', example: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  stage_order?: number;

  @ApiPropertyOptional({ description: 'UUID of uploaded animation asset', example: 'a0000000-0000-0000-0000-000000000001' })
  @IsUUID()
  @IsOptional()
  animation_asset_id?: string;

  @ApiPropertyOptional({ description: 'UUID of uploaded animation asset', example: 'a0000000-0000-0000-0000-000000000001' })
  @IsUUID()
  @IsOptional()
  animationAssetId?: string;

  // Legacy string animation path retained as optional for backward compatibility
  @ApiPropertyOptional({ description: 'Legacy animation name reference', example: 'foliage_lush' })
  @IsString()
  @IsOptional()
  animation?: string;

  @ApiPropertyOptional({ description: 'Start cultivation day for this stage', example: 1 })
  @IsInt()
  @Min(0)
  @IsOptional()
  min_day?: number;

  @ApiPropertyOptional({ description: 'Start cultivation day for this stage', example: 1 })
  @IsInt()
  @Min(0)
  @IsOptional()
  start_day?: number;

  @ApiPropertyOptional({ description: 'Start cultivation day for this stage', example: 1 })
  @IsInt()
  @Min(0)
  @IsOptional()
  startDay?: number;

  @ApiPropertyOptional({ description: 'End cultivation day for this stage', example: 15 })
  @IsInt()
  @Min(0)
  @IsOptional()
  max_day?: number;

  @ApiPropertyOptional({ description: 'End cultivation day for this stage', example: 15 })
  @IsInt()
  @Min(0)
  @IsOptional()
  end_day?: number;

  @ApiPropertyOptional({ description: 'End cultivation day for this stage', example: 15 })
  @IsInt()
  @Min(0)
  @IsOptional()
  endDay?: number;

  @ApiPropertyOptional({
    description: 'Mandatory initial input values for every variable declared in the parent rule',
    example: { water: 80, sunlight: 30, weather: 'rainy' },
  })
  @IsObject()
  @IsOptional()
  initial_inputs?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Mandatory initial input values for every variable declared in the parent rule',
    example: { water: 80, sunlight: 30, weather: 'rainy' },
  })
  @IsObject()
  @IsOptional()
  initialInputs?: Record<string, any>;
}

export class UpdateGrowthStageDto {
  @ApiPropertyOptional({ description: 'Stage name' })
  @IsString()
  @IsOptional()
  stage_name?: string;

  @ApiPropertyOptional({ description: 'Sequential order index of this stage' })
  @IsInt()
  @Min(1)
  @IsOptional()
  stage_order?: number;

  @ApiPropertyOptional({ description: 'UUID of uploaded animation asset' })
  @IsUUID()
  @IsOptional()
  animation_asset_id?: string;

  @ApiPropertyOptional({ description: 'UUID of uploaded animation asset' })
  @IsUUID()
  @IsOptional()
  animationAssetId?: string;

  // Legacy string animation path retained as optional for backward compatibility
  @ApiPropertyOptional({ description: 'Legacy animation name reference' })
  @IsString()
  @IsOptional()
  animation?: string;

  @ApiPropertyOptional({ description: 'Start cultivation day for this stage' })
  @IsInt()
  @Min(0)
  @IsOptional()
  min_day?: number;

  @ApiPropertyOptional({ description: 'Start cultivation day for this stage' })
  @IsInt()
  @Min(0)
  @IsOptional()
  start_day?: number;

  @ApiPropertyOptional({ description: 'Start cultivation day for this stage' })
  @IsInt()
  @Min(0)
  @IsOptional()
  startDay?: number;

  @ApiPropertyOptional({ description: 'End cultivation day for this stage' })
  @IsInt()
  @Min(0)
  @IsOptional()
  max_day?: number;

  @ApiPropertyOptional({ description: 'End cultivation day for this stage' })
  @IsInt()
  @Min(0)
  @IsOptional()
  end_day?: number;

  @ApiPropertyOptional({ description: 'End cultivation day for this stage' })
  @IsInt()
  @Min(0)
  @IsOptional()
  endDay?: number;

  @ApiPropertyOptional({
    description: 'Mandatory initial input values for every variable declared in the parent rule',
    example: { water: 80, sunlight: 30, weather: 'rainy' },
  })
  @IsObject()
  @IsOptional()
  initial_inputs?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Mandatory initial input values for every variable declared in the parent rule',
    example: { water: 80, sunlight: 30, weather: 'rainy' },
  })
  @IsObject()
  @IsOptional()
  initialInputs?: Record<string, any>;
}
