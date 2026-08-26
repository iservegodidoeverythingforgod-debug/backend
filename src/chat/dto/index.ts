import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiProperty({ example: 'Hello, I have a question about my seed order #ORD-12345.' })
  @IsString()
  @IsNotEmpty({ message: 'Message cannot be empty' })
  @MaxLength(2000, { message: 'Message is too long (maximum 2000 characters)' })
  message: string;

  @ApiPropertyOptional({ example: 'Order Inquiry' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  subject?: string;
}

export class SendMessageDto {
  @ApiProperty({ example: 'Thank you for following up!' })
  @IsString()
  @IsNotEmpty({ message: 'Message cannot be empty' })
  @MaxLength(2000, { message: 'Message is too long (maximum 2000 characters)' })
  message: string;
}
