import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User } from '../database/entities/user.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { Role } from '../common/enums';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ChangePasswordDto,
  UpdateProfileDto,
  VerifyOtpDto,
  ResendOtpDto,
} from './dto';
import { OtpService } from './otp.service';
import { StorageCleanupService } from '../common/storage/storage-cleanup.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private otpService: OtpService,
    private storageCleanupService: StorageCleanupService,
  ) {}

  /**
   * Hashes plain string using SHA256 for fast indexed database lookup
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generate short-lived Access Token (15m default) and long-lived Refresh Token (7d default)
   */
  private async generateTokens(user: User): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessSecret =
      this.configService.get<string>('JWT_ACCESS_SECRET') ||
      'seed_store_super_secret_access_jwt_key_2026!';
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      'seed_store_super_secret_refresh_jwt_key_2026_rotation!';

    const accessToken = this.jwtService.sign(payload, {
      secret: accessSecret,
      expiresIn: '15m',
    });

    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshJwt = this.jwtService.sign(
      { sub: user.id, token: rawRefreshToken },
      {
        secret: refreshSecret,
        expiresIn: '7d',
      },
    );

    // Store hashed refresh token in database (valid for 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const tokenHash = this.hashToken(refreshJwt);

    const refreshTokenEntity = this.refreshTokenRepository.create({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      is_revoked: false,
    });

    await this.refreshTokenRepository.save(refreshTokenEntity);

    return {
      accessToken,
      refreshToken: refreshJwt,
      expiresIn: 15 * 60, // 900 seconds
    };
  }

  /**
   * Register a new customer with OTP verification
   */
  async register(dto: RegisterDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (existing) {
      if (!existing.is_active) {
        throw new UnauthorizedException('This account has been deactivated.');
      }
      // If account exists but has not been verified yet, re-send OTP
      if (!existing.is_verified) {
        await this.otpService.sendOtp(existing.email, 'REGISTRATION');
        return {
          requiresVerification: true,
          email: existing.email,
          message: 'Account pending verification. A new verification code has been dispatched.',
        };
      }
      throw new ConflictException('An account with this email already exists.');
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(dto.password, salt);

    const user = this.userRepository.create({
      email: normalizedEmail,
      password_hash,
      full_name: dto.full_name,
      phone: dto.phone,
      address: dto.address,
      role: Role.CUSTOMER,
      is_active: true,
      is_verified: false,
    });

    const savedUser = await this.userRepository.save(user);

    // Send 6-digit OTP
    await this.otpService.sendOtp(savedUser.email, 'REGISTRATION');

    return {
      requiresVerification: true,
      email: savedUser.email,
      message: 'Registration successful. Please verify your email with the 6-digit verification code.',
    };
  }

  /**
   * Verify 6-digit OTP and activate account
   */
  async verifyOtpAndActivate(dto: VerifyOtpDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new NotFoundException('No account found for this email.');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Account has been deactivated.');
    }

    // Verify OTP
    await this.otpService.verifyOtp(email, dto.code);

    // Activate user
    user.is_verified = true;
    user.verified_at = new Date();
    await this.userRepository.save(user);

    // Generate JWT tokens
    const tokens = await this.generateTokens(user);
    const { password_hash: _, ...safeUser } = user;

    return {
      user: safeUser,
      ...tokens,
    };
  }

  /**
   * Resend Verification OTP
   */
  async resendVerificationOtp(dto: ResendOtpDto) {
    const email = dto.email.toLowerCase().trim();
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new NotFoundException('No account found with this email.');
    }

    if (user.is_verified) {
      throw new BadRequestException('This account is already verified. Please log in directly.');
    }

    return this.otpService.sendOtp(email, 'REGISTRATION');
  }

  /**
   * Log in user (Customer or Admin)
   */
  async login(dto: LoginDto) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password_hash')
      .where('user.email = :email', { email: dto.email.toLowerCase().trim() })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Invalid email or password credentials');
    }

    if (!user.is_active || user.role === Role.SYSTEM) {
      throw new UnauthorizedException(
        'Account has been suspended or deactivated. Please contact support.',
      );
    }

    const isMatch = await bcrypt.compare(dto.password, user.password_hash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password credentials');
    }

    // If customer is not verified yet, send new OTP and require verification
    if (!user.is_verified && user.role !== Role.ADMIN) {
      await this.otpService.sendOtp(user.email, 'REGISTRATION');
      throw new UnauthorizedException({
        statusCode: 401,
        requiresVerification: true,
        email: user.email,
        message: 'Account not verified. A new 6-digit verification code has been sent to your email.',
      });
    }

    const tokens = await this.generateTokens(user);
    const { password_hash: _, ...safeUser } = user;

    return {
      user: safeUser,
      ...tokens,
    };
  }

  /**
   * Refresh Token Endpoint with Token Rotation & Reuse Detection
   */
  async refresh(dto: RefreshTokenDto) {
    const refreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      'seed_store_super_secret_refresh_jwt_key_2026_rotation!';

    let payload: any;
    try {
      payload = this.jwtService.verify(dto.refreshToken, {
        secret: refreshSecret,
      });
    } catch (e) {
      throw new UnauthorizedException('Refresh token is invalid or expired. Please log in again.');
    }

    const tokenHash = this.hashToken(dto.refreshToken);

    const tokenRecord = await this.refreshTokenRepository.findOne({
      where: { token_hash: tokenHash },
      relations: ['user'],
    });

    if (!tokenRecord) {
      this.logger.warn(`Potential token theft or unknown token: ${tokenHash}`);
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (tokenRecord.is_revoked) {
      this.logger.warn(`Revoked refresh token reuse attempt for user: ${tokenRecord.user_id}`);
      // Invalidate all active tokens for this user for security
      await this.refreshTokenRepository.update(
        { user_id: tokenRecord.user_id },
        { is_revoked: true },
      );
      throw new UnauthorizedException('Refresh token has been revoked. Re-authentication required.');
    }

    if (new Date() > new Date(tokenRecord.expires_at)) {
      await this.refreshTokenRepository.update(tokenRecord.id, { is_revoked: true });
      throw new UnauthorizedException('Refresh token expired. Please log in again.');
    }

    const user = await this.userRepository.findOne({
      where: { id: tokenRecord.user_id },
    });

    if (!user || !user.is_active) {
      throw new UnauthorizedException('User account no longer active');
    }

    // ROTATE: Invalidate the used refresh token immediately
    tokenRecord.is_revoked = true;
    await this.refreshTokenRepository.save(tokenRecord);

    // Issue brand new access + refresh token pair
    const tokens = await this.generateTokens(user);

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        avatar_url: user.avatar_url,
      },
      ...tokens,
    };
  }

  /**
   * Log out user: revoke given refresh token or all user tokens
   */
  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.refreshTokenRepository.update(
        { token_hash: tokenHash },
        { is_revoked: true },
      );
    } else {
      await this.refreshTokenRepository.update(
        { user_id: userId },
        { is_revoked: true },
      );
    }
    return { success: true, message: 'Successfully logged out and session revoked.' };
  }

  /**
   * Get current authenticated user profile
   */
  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    return user;
  }

  /**
   * Update current user profile
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.full_name !== undefined) user.full_name = dto.full_name;
    if (dto.phone !== undefined) user.phone = dto.phone;
    if (dto.address !== undefined) user.address = dto.address;
    if (dto.avatar_url !== undefined) {
      const oldAvatar = user.avatar_url;
      if (oldAvatar && oldAvatar !== dto.avatar_url) {
        this.storageCleanupService.deleteFileByUrl(oldAvatar).catch((err) => {
          this.logger.warn(`Failed to cleanup old avatar '${oldAvatar}': ${err}`);
        });
      }
      user.avatar_url = dto.avatar_url;
    }

    return await this.userRepository.save(user);
  }

  /**
   * Change user password & revoke prior sessions for security
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password_hash')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isMatch = await bcrypt.compare(dto.oldPassword, user.password_hash);
    if (!isMatch) {
      throw new BadRequestException('Current password does not match.');
    }

    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(dto.newPassword, salt);
    await this.userRepository.save(user);

    // Invalidate previous refresh tokens
    await this.refreshTokenRepository.update(
      { user_id: userId },
      { is_revoked: true },
    );

    return { success: true, message: 'Password changed successfully. Please log in again.' };
  }
}
