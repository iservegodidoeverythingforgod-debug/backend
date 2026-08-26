import {
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  IsOptional,
  IsString,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '../../common/enums';

export class OrderItemDto {
  @ApiPropertyOptional({ example: 'b0000000-0000-0000-0000-000000000001' })
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional({ example: 'b0000000-0000-0000-0000-000000000001' })
  @IsOptional()
  @IsString()
  product_id?: string;

  @ApiProperty({ example: 2 })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 5.95 })
  @IsOptional()
  @IsNumber()
  price?: number;
}

export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiPropertyOptional({ example: 'Somchai Greenery' })
  @IsOptional()
  @IsString()
  shipping_name?: string;

  @ApiPropertyOptional({ example: 'Somchai Greenery' })
  @IsOptional()
  @IsString()
  shippingName?: string;

  @ApiPropertyOptional({ example: '456 Organic Way, Chiang Mai, Thailand' })
  @IsOptional()
  @IsString()
  shipping_address?: string;

  @ApiPropertyOptional({ example: '456 Organic Way, Chiang Mai, Thailand' })
  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @ApiPropertyOptional({ example: '+66 89 876 5432' })
  @IsOptional()
  @IsString()
  shipping_phone?: string;

  @ApiPropertyOptional({ example: '+66 89 876 5432' })
  @IsOptional()
  @IsString()
  shippingPhone?: string;

  @ApiPropertyOptional({ example: 'Leave at front porch.' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;
}
