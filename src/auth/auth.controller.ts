import {
  Controller,
  Post,
  Body,
  Get,
  Put,
  UseGuards,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  Req,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ChangePasswordDto,
  UpdateProfileDto,
  VerifyOtpDto,
  ResendOtpDto,
} from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { SupabaseStorageService } from '../common/storage/supabase-storage.service';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';

@ApiTags('Authentication & Profile')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly supabaseStorageService: SupabaseStorageService,
  ) {}

  private getCookieOptions(req?: Request) {
    const isProd = process.env.NODE_ENV === 'production';
    const isHttps = req ? (req.secure || req.headers['x-forwarded-proto'] === 'https') : isProd;
    const secure = isProd || Boolean(isHttps);
    const sameSite: 'none' | 'lax' = secure ? 'none' : 'lax';

    return {
      secure,
      sameSite,
      path: '/',
    };
  }

  private setRefreshTokenCookie(res: Response, refreshToken: string, req?: Request) {
    const baseOptions = this.getCookieOptions(req);
    res.cookie('refreshToken', refreshToken, {
      ...baseOptions,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    res.cookie('has_session', '1', {
      ...baseOptions,
      httpOnly: false,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  private clearRefreshTokenCookie(res: Response, req?: Request) {
    const baseOptions = this.getCookieOptions(req);
    res.clearCookie('refreshToken', {
      ...baseOptions,
      httpOnly: true,
    });
    res.clearCookie('has_session', {
      ...baseOptions,
      httpOnly: false,
    });
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new customer account and trigger OTP verification' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify 6-digit OTP code and activate customer account' })
  async verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyOtpAndActivate(dto);
    if (result.refreshToken) {
      this.setRefreshTokenCookie(res, result.refreshToken, req);
    }
    return result;
  }

  @Public()
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend 6-digit OTP verification code' })
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendVerificationOtp(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    if (result.refreshToken) {
      this.setRefreshTokenCookie(res, result.refreshToken, req);
    }
    return result;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using valid refresh token (Cookie or Body)' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto.refreshToken || req.cookies?.refreshToken;
    if (!token) {
      throw new BadRequestException('Refresh token is required via cookie or request body');
    }
    const result = await this.authService.refresh({ refreshToken: token });
    if (result.refreshToken) {
      this.setRefreshTokenCookie(res, result.refreshToken, req);
    }
    return result;
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out and revoke refresh token session' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser('id') userId?: string,
    @Body() dto?: RefreshTokenDto,
  ) {
    const token = dto?.refreshToken || req.cookies?.refreshToken;
    this.clearRefreshTokenCookie(res, req);
    return this.authService.logout(userId || '', token);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current logged-in user profile' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current logged-in user profile (alias)' })
  async getProfileAlias(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile info' })
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(userId, dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change current user password and revoke old tokens' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }

  @Post('avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        avatar: {
          type: 'string',
          format: 'binary',
          description: 'Avatar image file (jpg, jpeg, png, webp, gif max 8MB)',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Upload user profile avatar image' })
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 }, // 8MB limit
      fileFilter: (_req, file, callback) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp|gif)$/i)) {
          return callback(
            new BadRequestException(
              'Only image files (jpg, jpeg, png, webp, gif) are allowed',
            ),
            false,
          );
        }
        callback(null, true);
      },
    }),
  )
  async uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Please upload an avatar image file');
    }
    const ext = extname(file.originalname).toLowerCase() || '.png';
    const key = `${userId}/${randomUUID()}${ext}`;
    const avatarUrl = await this.supabaseStorageService.uploadFile(
      'avatars',
      key,
      file.buffer,
      file.mimetype || 'image/jpeg',
    );
    const updated = await this.authService.updateProfile(userId, {
      avatar_url: avatarUrl,
    });
    return {
      success: true,
      avatar_url: avatarUrl,
      user: updated,
    };
  }
}
