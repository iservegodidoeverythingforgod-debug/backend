import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PromptPayType } from '../../database/entities/store-setting.entity';

export class UpdatePromptPaySettingDto {
  @ApiProperty({
    description:
      'Merchant PromptPay ID (10-digit mobile number starting with 0, or 13-digit National ID / Tax ID)',
    example: '0812345678',
  })
  @IsString()
  @IsNotEmpty({ message: 'PromptPay ID cannot be empty' })
  @Matches(/^(0[0-9]{9}|[0-9]{13})$/, {
    message:
      'PromptPay ID must be either a valid 10-digit phone number starting with 0 (e.g. 0812345678) or a 13-digit National ID / Tax ID (e.g. 1234567890123)',
  })
  promptpay_id: string;

  @ApiProperty({
    enum: PromptPayType,
    description: 'PromptPay Identifier Type',
    example: PromptPayType.PHONE,
  })
  @IsEnum(PromptPayType, {
    message: 'PromptPay type must be either "phone" or "national_id"',
  })
  promptpay_type: PromptPayType;

  @ApiPropertyOptional({
    description: 'Merchant / Business Account Display Name',
    example: 'Organic Seed & Herb Store Co., Ltd.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(255, { message: 'Account name cannot exceed 255 characters' })
  account_name?: string;
}
