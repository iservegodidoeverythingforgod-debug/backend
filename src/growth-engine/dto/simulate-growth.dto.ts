import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Min, Max, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class SimulateGrowthDto {
  @ApiPropertyOptional({
    description: 'Generic dictionary of simulated inputs (number or string values, e.g. { wind: 70, season: "rainy" })',
    example: { water: 65, ph: 6.5, wind: 40, season: 'rainy' },
  })
  @IsOptional()
  @IsObject()
  inputs?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Simulated daily water / soil moisture % (0-100)', example: 65 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  water?: number;

  @ApiPropertyOptional({ description: 'Simulated daily sunlight hours (0-24)', example: 8.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  @IsOptional()
  sunlight?: number;

  @ApiPropertyOptional({ description: 'Simulated ambient temperature in °C (0-50)', example: 28.0 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(50)
  @IsOptional()
  temperature?: number;

  @ApiPropertyOptional({ description: 'Simulated soil pH (3.0-10.0)', example: 6.5 })
  @Type(() => Number)
  @IsNumber()
  @Min(3)
  @Max(10)
  @IsOptional()
  ph?: number;

  @ApiPropertyOptional({ description: 'Simulated Nitrogen (N) concentration ratio (0-100)', example: 50 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  n?: number;

  @ApiPropertyOptional({ description: 'Simulated Phosphorus (P) concentration ratio (0-100)', example: 40 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  p?: number;

  @ApiPropertyOptional({ description: 'Simulated Potassium (K) concentration ratio (0-100)', example: 50 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  k?: number;

  @ApiPropertyOptional({ description: 'Cultivation timeline scrubber day (1 to harvest)', example: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  day?: number;

  @ApiPropertyOptional({ description: 'Cultivation timeline scrubber day (1 to harvest)', example: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  cultivationDay?: number;

  @ApiPropertyOptional({ description: 'Specific stage ID override if testing a specific stage' })
  @IsString()
  @IsOptional()
  stageId?: string;

  @ApiPropertyOptional({ description: 'Rule ID override for direct growth engine simulation' })
  @IsString()
  @IsOptional()
  ruleId?: string;
}
