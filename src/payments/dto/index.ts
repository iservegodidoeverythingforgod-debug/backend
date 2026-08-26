import { IsNotEmpty, IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus } from '../../common/enums';

export class VerifyPaymentDto {
  @ApiProperty({ enum: [PaymentStatus.VERIFIED, PaymentStatus.REJECTED] })
  @IsEnum(PaymentStatus)
  @IsNotEmpty()
  status: PaymentStatus.VERIFIED | PaymentStatus.REJECTED;

  @ApiPropertyOptional({ example: 'Slip verified with bank record.' })
  @IsOptional()
  @IsString()
  notes?: string;
}
