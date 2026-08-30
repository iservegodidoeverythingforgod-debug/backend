import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, EntityManager } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User } from '../database/entities/user.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { PendingRegistration } from '../database/entities/pending-registration.entity';
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
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Security Configuration Constants
  private readonly OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes validity
  private readonly RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown
  private readonly MAX_VERIFY_ATTEMPTS = 5; // Max 5 wrong guesses before invalidation

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(PendingRegistration)
    private pendingRegistrationRepository: Repository<PendingRegistration>,
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
   * Robust parser converting duration strings or numeric seconds into milliseconds
   */
  private parseDuration(duration: string | number): number {
    if (typeof duration === 'number') {
      return duration * 1000;
    }
    if (!duration || typeof duration !== 'string') {
      return 15 * 60 * 1000;
    }

    const trimmed = duration.trim();
    if (/^\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10) * 1000;
    }

    const match = /^(\d+)\s*(ms|s|m|h|d|w|y)$/i.exec(trimmed);
    if (!match) {
      this.logger.warn(`Invalid duration format: "${duration}", falling back to default.`);
      return 15 * 60 * 1000;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    const unitMs: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
      w: 7 * 24 * 60 * 60 * 1000,
      y: 365 * 24 * 60 * 60 * 1000,
    };

    return value * (unitMs[unit] || 1000);
  }

  /**
   * Generate short-lived Access Token (15m default) and long-lived Refresh Token (7d default)
   */
  private async generateTokens(
    user: User,
    manager?: EntityManager,
  ): Promise<{
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
    
    const accessExpiration = this.configService.get<string>('JWT_ACCESS_EXPIRATION') || '15m';
    const refreshExpiration = this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '7d';

    const accessToken = this.jwtService.sign(payload, {
      secret: accessSecret,
      expiresIn: accessExpiration as JwtSignOptions['expiresIn'],
    });

    const rawRefreshToken = crypto.randomBytes(40).toString('hex');
    const refreshJwt = this.jwtService.sign(
      { sub: user.id, token: rawRefreshToken },
      {
        secret: refreshSecret,
        expiresIn: refreshExpiration as JwtSignOptions['expiresIn'],
      },
    );

    // Store hashed refresh token in database
    const expiresAt = new Date(Date.now() + this.parseDuration(refreshExpiration));
    const tokenHash = this.hashToken(refreshJwt);

    const refreshTokenEntity = manager
      ? manager.create(RefreshToken, {
          user_id: user.id,
          token_hash: tokenHash,
          expires_at: expiresAt,
          is_revoked: false,
        })
      : this.refreshTokenRepository.create({
          user_id: user.id,
          token_hash: tokenHash,
          expires_at: expiresAt,
          is_revoked: false,
        });

    if (manager) {
      await manager.save(RefreshToken, refreshTokenEntity);
    } else {
      await this.refreshTokenRepository.save(refreshTokenEntity);
    }

    return {
      accessToken,
      refreshToken: refreshJwt,
      expiresIn: Math.round(this.parseDuration(accessExpiration) / 1000),
    };
  }

  /**
   * Initiate customer registration with OTP verification without writing to users table
   */
  async register(dto: RegisterDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();

    // 1. Check if email is already registered to an existing active/verified user
    const existingUser = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      if (!existingUser.is_active) {
        throw new UnauthorizedException('This account has been deactivated.');
      }
      throw new ConflictException('An account with this email already exists.');
    }

    // 2. Lazy cleanup: purge any expired pending registration for this email
    await this.pendingRegistrationRepository.delete({
      email: normalizedEmail,
      otp_expires_at: LessThan(new Date()),
    });

    // 3. Check if an active unexpired pending registration exists for anti-spam cooldown
    const existingPending = await this.pendingRegistrationRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (existingPending && existingPending.otp_expires_at > new Date()) {
      const timeSinceLast = Date.now() - new Date(existingPending.updated_at).getTime();
      if (timeSinceLast < this.RESEND_COOLDOWN_MS) {
        const remainingSec = Math.ceil((this.RESEND_COOLDOWN_MS - timeSinceLast) / 1000);
        throw new BadRequestException(
          `Please wait ${remainingSec} seconds before requesting a new verification code.`,
        );
      }
    }

    // 4. Hash password with bcrypt
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(dto.password, salt);

    // 5. Generate secure 6-digit numeric OTP and compute HMAC-SHA256 hash
    const rawOtp = this.otpService.generateSecureCode();
    const hashedOtp = this.otpService.hashOtp(rawOtp);
    const otpExpiresAt = new Date(Date.now() + this.OTP_TTL_MS);

    // 6. Save or update pending registration record with race-condition safety
    let pendingRecord: PendingRegistration;
    try {
      if (existingPending) {
        existingPending.full_name = dto.full_name.trim();
        existingPending.password_hash = password_hash;
        existingPending.phone = dto.phone?.trim();
        existingPending.address = dto.address?.trim();
        existingPending.otp_code = hashedOtp;
        existingPending.otp_expires_at = otpExpiresAt;
        existingPending.attempts = 0;
        existingPending.updated_at = new Date();
        pendingRecord = await this.pendingRegistrationRepository.save(existingPending);
      } else {
        const pending = this.pendingRegistrationRepository.create({
          email: normalizedEmail,
          full_name: dto.full_name.trim(),
          password_hash,
          phone: dto.phone?.trim(),
          address: dto.address?.trim(),
          otp_code: hashedOtp,
          otp_expires_at: otpExpiresAt,
          attempts: 0,
        });
        pendingRecord = await this.pendingRegistrationRepository.save(pending);
      }
    } catch (dbErr: any) {
      // In case of parallel registration race condition, retry fetch and update
      const retryPending = await this.pendingRegistrationRepository.findOne({
        where: { email: normalizedEmail },
      });
      if (retryPending) {
        retryPending.full_name = dto.full_name.trim();
        retryPending.password_hash = password_hash;
        retryPending.phone = dto.phone?.trim();
        retryPending.address = dto.address?.trim();
        retryPending.otp_code = hashedOtp;
        retryPending.otp_expires_at = otpExpiresAt;
        retryPending.attempts = 0;
        retryPending.updated_at = new Date();
        pendingRecord = await this.pendingRegistrationRepository.save(retryPending);
      } else {
        throw dbErr;
      }
    }

    // 7. Dispatch OTP email with guaranteed rollback on failure
    try {
      await this.otpService.sendRegistrationEmail(normalizedEmail, rawOtp);
    } catch (err: any) {
      // Rollback pending record if email dispatch fails
      await this.pendingRegistrationRepository.delete({ id: pendingRecord.id });
      this.logger.error(`Failed to send OTP verification email to ${normalizedEmail}: ${err.message}`);
      throw new BadRequestException(
        'Unable to dispatch verification email. Please verify your email address and try again.',
      );
    }

    return {
      requiresVerification: true,
      email: normalizedEmail,
      message:
        'Registration initiated. Please verify your email with the 6-digit verification code.',
    };
  }

  /**
   * Verify 6-digit OTP against pending_registrations and atomically create user record
   */
  async verifyOtpAndActivate(dto: VerifyOtpDto) {
    const email = dto.email.toLowerCase().trim();

    // 1. Lazy cleanup of expired record
    await this.pendingRegistrationRepository.delete({
      email,
      otp_expires_at: LessThan(new Date()),
    });

    // 2. Fetch pending registration record
    const pending = await this.pendingRegistrationRepository.findOne({
      where: { email },
    });

    if (!pending) {
      throw new BadRequestException(
        'Verification code has expired or registration was not initiated. Please register again.',
      );
    }

    // 3. Enforce maximum brute-force verification attempt limit (5 attempts)
    if (pending.attempts >= this.MAX_VERIFY_ATTEMPTS) {
      await this.pendingRegistrationRepository.delete({ id: pending.id });
      throw new UnauthorizedException(
        'Too many failed verification attempts. This registration has been invalidated. Please register again.',
      );
    }

    // 4. Verify OTP using constant-time HMAC-SHA256 comparison
    const isValid = this.otpService.verifyOtpHash(dto.code, pending.otp_code);

    if (!isValid) {
      pending.attempts += 1;
      if (pending.attempts >= this.MAX_VERIFY_ATTEMPTS) {
        await this.pendingRegistrationRepository.delete({ id: pending.id });
        throw new UnauthorizedException(
          'Too many failed verification attempts. This registration has been invalidated. Please register again.',
        );
      }
      await this.pendingRegistrationRepository.save(pending);
      const remaining = this.MAX_VERIFY_ATTEMPTS - pending.attempts;
      throw new BadRequestException(
        `Invalid verification code. ${remaining} attempt(s) remaining.`,
      );
    }

    // 5. Execute atomic transaction: create real User, delete PendingRegistration, issue tokens
    const { safeUser, tokens } = await this.userRepository.manager.transaction(
      async (manager) => {
        // Double-check email is not claimed by another completed registration in the interim
        const existingCheck = await manager.findOne(User, { where: { email } });
        if (existingCheck) {
          await manager.delete(PendingRegistration, { id: pending.id });
          throw new ConflictException('An account with this email already exists.');
        }

        const newUser = manager.create(User, {
          email: pending.email,
          password_hash: pending.password_hash,
          full_name: pending.full_name,
          phone: pending.phone,
          address: pending.address,
          role: Role.CUSTOMER,
          is_active: true,
          is_verified: true,
          verified_at: new Date(),
        });

        const savedUser = await manager.save(newUser);

        // Delete pending registration
        await manager.delete(PendingRegistration, { id: pending.id });

        // Generate JWT tokens within the same transaction to maintain FK integrity
        const tokens = await this.generateTokens(savedUser, manager);
        const { password_hash: _, ...safeUser } = savedUser;

        return { safeUser, tokens };
      },
    );

    return {
      user: safeUser,
      ...tokens,
    };
  }

  /**
   * Resend Verification OTP for active pending registration
   */
  async resendVerificationOtp(dto: ResendOtpDto) {
    const email = dto.email.toLowerCase().trim();

    // 1. Check if account is already verified
    const user = await this.userRepository.findOne({ where: { email } });
    if (user && user.is_verified) {
      throw new BadRequestException(
        'This account is already verified. Please log in directly.',
      );
    }

    // 2. Lazy cleanup of expired record
    await this.pendingRegistrationRepository.delete({
      email,
      otp_expires_at: LessThan(new Date()),
    });

    // 3. Find pending registration record
    const pending = await this.pendingRegistrationRepository.findOne({
      where: { email },
    });

    if (!pending) {
      throw new NotFoundException(
        'No pending registration found for this email. Please register first.',
      );
    }

    // 4. Enforce 60-second cooldown
    const timeSinceLast = Date.now() - new Date(pending.updated_at).getTime();
    if (timeSinceLast < this.RESEND_COOLDOWN_MS) {
      const remainingSec = Math.ceil((this.RESEND_COOLDOWN_MS - timeSinceLast) / 1000);
      throw new BadRequestException(
        `Please wait ${remainingSec} seconds before requesting a new verification code.`,
      );
    }

    // 5. Generate fresh OTP
    const rawOtp = this.otpService.generateSecureCode();
    const hashedOtp = this.otpService.hashOtp(rawOtp);
    const otpExpiresAt = new Date(Date.now() + this.OTP_TTL_MS);

    // 6. Send email with error protection
    try {
      await this.otpService.sendRegistrationEmail(email, rawOtp);
    } catch (err: any) {
      this.logger.error(`Failed to resend verification OTP to ${email}: ${err.message}`);
      throw new BadRequestException(
        'Unable to dispatch verification email. Please verify your email address and try again.',
      );
    }

    // 7. Update pending record with fresh OTP & update timestamp only on successful email delivery
    pending.otp_code = hashedOtp;
    pending.otp_expires_at = otpExpiresAt;
    pending.attempts = 0;
    pending.updated_at = new Date();
    await this.pendingRegistrationRepository.save(pending);

    return {
      success: true,
      cooldownSeconds: 60,
      message: 'A new verification code has been dispatched.',
    };
  }

  onModuleInit() {
    // Initial cleanup on application boot
    this.cleanupExpiredPendingRegistrations();
    this.cleanupExpiredRefreshTokens();

    // Periodic purge every 15 minutes for expired OTPs and expired/revoked refresh tokens
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupExpiredPendingRegistrations();
      await this.cleanupExpiredRefreshTokens();
    }, 15 * 60 * 1000);

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Background Purge: Purges expired pending registrations (OTPs)
   */
  async cleanupExpiredPendingRegistrations() {
    try {
      const result = await this.pendingRegistrationRepository.delete({
        otp_expires_at: LessThan(new Date()),
      });
      if (result.affected && result.affected > 0) {
        this.logger.log(`Purged ${result.affected} expired pending registration(s).`);
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to purge expired pending registrations: ${err.message}`,
      );
    }
  }

  /**
   * Background Purge: Purges expired and revoked refresh tokens past their validity window
   */
  async cleanupExpiredRefreshTokens() {
    try {
      const result = await this.refreshTokenRepository.delete({
        expires_at: LessThan(new Date()),
      });
      if (result.affected && result.affected > 0) {
        this.logger.log(`Purged ${result.affected} expired/revoked refresh token(s).`);
      }
    } catch (err: any) {
      this.logger.error(
        `Failed to purge expired refresh tokens: ${err.message}`,
      );
    }
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

    if (!user || !user.password_hash) {
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

    const user = tokenRecord.user || (await this.userRepository.findOne({
      where: { id: tokenRecord.user_id },
    }));

    if (!user || !user.is_active) {
      throw new UnauthorizedException('User account no longer active');
    }

    // ROTATE: Invalidate the used refresh token immediately
    tokenRecord.is_revoked = true;
    await this.refreshTokenRepository.save(tokenRecord);

    // Issue brand new access + refresh token pair
    const tokens = await this.generateTokens(user);
    const { password_hash: _, ...safeUser } = user;

    return {
      user: safeUser,
      ...tokens,
    };
  }

  /**
   * Log out user: revoke given refresh token or all user tokens
   */
  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      const whereClause: any = { token_hash: tokenHash };
      if (userId) {
        whereClause.user_id = userId;
      }
      await this.refreshTokenRepository.update(
        whereClause,
        { is_revoked: true },
      );
    } else if (userId) {
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
    if (!user.is_active) {
      throw new UnauthorizedException('User account has been deactivated.');
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
   * Change user password & revoke prior sessions for security atomically
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password_hash')
      .where('user.id = :id', { id: userId })
      .getOne();

    if (!user || !user.password_hash) {
      throw new NotFoundException('User not found');
    }

    const isMatch = await bcrypt.compare(dto.oldPassword, user.password_hash);
    if (!isMatch) {
      throw new BadRequestException('Current password does not match.');
    }

    if (dto.oldPassword === dto.newPassword) {
      throw new BadRequestException('New password must be different from current password.');
    }

    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(dto.newPassword, salt);

    await this.userRepository.manager.transaction(async (manager) => {
      await manager.update(User, { id: userId }, { password_hash: newPasswordHash });
      await manager.update(RefreshToken, { user_id: userId }, { is_revoked: true });
    });

    return { success: true, message: 'Password changed successfully. Please log in again.' };
  }
}
