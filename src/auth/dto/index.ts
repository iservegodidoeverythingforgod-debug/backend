import { IsEmail, IsNotEmpty, MinLength, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'customer@seedstore.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Pass123456!' })
  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @ApiProperty({ example: 'Somchai Greenery' })
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  full_name: string;

  @ApiPropertyOptional({ example: '+66 89 876 5432' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '456 Organic Way, Chiang Mai, Thailand' })
  @IsOptional()
  @IsString()
  address?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'customer@seedstore.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Pass123456!' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'The long-lived refresh token issued during login/refresh' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPass123!' })
  @IsString()
  @IsNotEmpty()
  oldPassword: string;

  @ApiProperty({ example: 'NewPass123!' })
  @IsString()
  @MinLength(6, { message: 'New password must be at least 6 characters long' })
  newPassword: string;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Somchai Greenery' })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiPropertyOptional({ example: '+66 89 876 5432' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '456 Organic Way, Chiang Mai, Thailand' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'https://example.com/avatar.jpg' })
  @IsOptional()
  @IsString()
  avatar_url?: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: 'customer@seedstore.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @IsNotEmpty({ message: 'Verification code is required' })
  @MinLength(6, { message: 'Verification code must be 6 digits' })
  code: string;
}

export class ResendOtpDto {
  @ApiProperty({ example: 'customer@seedstore.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  email: string;
}
