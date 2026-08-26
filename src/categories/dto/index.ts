import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Culinary Herbs' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'culinary-herbs' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiPropertyOptional({ example: 'Fresh aromatic herbs for kitchen cooking' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'eco' })
  @IsOptional()
  @IsString()
  icon?: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'Culinary Herbs' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'culinary-herbs' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({ example: 'Fresh aromatic herbs for kitchen cooking' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'eco' })
  @IsOptional()
  @IsString()
  icon?: string;
}
