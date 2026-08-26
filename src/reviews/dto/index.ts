import { IsNotEmpty, IsString, IsNumber, Min, Max, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateReviewDto {
  @ApiPropertyOptional({ description: 'Order ID associated with this review' })
  @IsOptional()
  @IsString()
  orderId?: string;

  @ApiPropertyOptional({ description: 'Order ID (alias)' })
  @IsOptional()
  @IsString()
  order_id?: string;

  @ApiPropertyOptional({ description: 'Target Product ID' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ description: 'Target Product ID (alias)' })
  @IsOptional()
  @IsString()
  product_id?: string;

  @ApiPropertyOptional({ description: 'Target Product Name (fallback if ID is missing)' })
  @IsOptional()
  @IsString()
  productName?: string;

  @ApiPropertyOptional({ description: 'Target Product Name (alias)' })
  @IsOptional()
  @IsString()
  product_name?: string;

  @ApiProperty({ example: 5, description: 'Satisfaction rating (1 to 5 stars)' })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ example: 'Excellent germination rate, sprouted in 4 days!' })
  @IsString()
  @IsNotEmpty()
  comment: string;
}
