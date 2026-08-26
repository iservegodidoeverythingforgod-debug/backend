import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsOptional,
  Min,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'Thai Holy Basil (Krapow)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Ocimum sanctum' })
  @IsOptional()
  @IsString()
  scientific_name?: string;

  @ApiPropertyOptional({ example: 'c0000001-0000-0000-0000-000000000001' })
  @IsOptional()
  @IsString()
  category_id?: string;

  @ApiPropertyOptional({ example: 'r0000001-0000-0000-0000-000000000001' })
  @IsOptional()
  @IsString()
  rule_id?: string;

  @ApiProperty({ example: 'Essential Thai culinary herb with spicy peppery aroma.' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ example: 'Full multi-paragraph write-up on cultivation, harvesting, and culinary pairings.' })
  @IsOptional()
  @IsString()
  detailed_description?: string;

  @ApiProperty({ example: 150.0 })
  @IsNumber()
  @Min(0, { message: 'Price cannot be negative' })
  price: number;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0, { message: 'Stock cannot be negative' })
  stock: number;

  @ApiPropertyOptional({ example: 'https://images.unsplash.com/photo-1618164436241-4473940d1f5c' })
  @IsOptional()
  @IsString()
  image_url?: string;

  @ApiPropertyOptional({ type: [String], example: ['https://images.unsplash.com/photo-1618164436241-4473940d1f5c'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ example: 'Easy' })
  @IsOptional()
  @IsString()
  difficulty?: string;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  germination_days?: number;

  @ApiProperty({ example: 60 })
  @IsNumber()
  @Min(1, { message: 'Harvest days must be greater than 0' })
  harvest_days: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Thai Holy Basil (Krapow)' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Ocimum sanctum' })
  @IsOptional()
  @IsString()
  scientific_name?: string;

  @ApiPropertyOptional({ example: 'c0000001-0000-0000-0000-000000000001' })
  @IsOptional()
  @IsString()
  category_id?: string;

  @ApiPropertyOptional({ example: 'r0000001-0000-0000-0000-000000000001' })
  @IsOptional()
  @IsString()
  rule_id?: string;

  @ApiPropertyOptional({ example: 'Essential Thai culinary herb with spicy peppery aroma.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Full multi-paragraph write-up on cultivation, harvesting, and culinary pairings.' })
  @IsOptional()
  @IsString()
  detailed_description?: string;

  @ApiPropertyOptional({ example: 150.0 })
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Price cannot be negative' })
  price?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0, { message: 'Stock cannot be negative' })
  stock?: number;

  @ApiPropertyOptional({ example: 'https://images.unsplash.com/photo-1618164436241-4473940d1f5c' })
  @IsOptional()
  @IsString()
  image_url?: string;

  @ApiPropertyOptional({ type: [String], example: ['https://images.unsplash.com/photo-1618164436241-4473940d1f5c'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ example: 'Easy' })
  @IsOptional()
  @IsString()
  difficulty?: string;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  germination_days?: number;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsNumber()
  @Min(1, { message: 'Harvest days must be greater than 0' })
  harvest_days?: number;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
