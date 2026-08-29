import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { User } from '../database/entities/user.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { PendingRegistration } from '../database/entities/pending-registration.entity';
import { StorageCleanupService } from '../common/storage/storage-cleanup.service';
import { Role } from '../common/enums';

describe('AuthService - Verify-Then-Create Registration Flow', () => {
  let service: AuthService;
  let otpService: OtpService;

  let mockUserRepo: any;
  let mockRefreshTokenRepo: any;
  let mockPendingRepo: any;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockStorageCleanupService: any;
  let mockEntityManager: any;

  beforeEach(async () => {
    mockEntityManager = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((entityClass, dto) => ({ id: 'user-uuid-1', ...dto })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockUserRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((u) => Promise.resolve({ id: 'user-uuid-1', ...u })),
      create: jest.fn().mockImplementation((dto) => dto),
      manager: {
        transaction: jest.fn().mockImplementation(async (callback) => callback(mockEntityManager)),
      },
    };

    mockRefreshTokenRepo = {
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((dto) => Promise.resolve(dto)),
    };

    mockPendingRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((dto) => ({ id: 'pending-uuid-1', ...dto })),
      save: jest.fn().mockImplementation((dto) => Promise.resolve({ id: 'pending-uuid-1', ...dto })),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockJwtService = {
      sign: jest.fn().mockReturnValue('mock.jwt.token'),
    };

    mockConfigService = {
      get: jest.fn((key: string, defaultVal?: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'OTP_HMAC_SECRET') return 'test_hmac_secret_key_123456';
        if (key === 'JWT_ACCESS_SECRET') return 'test_jwt_access_secret';
        if (key === 'JWT_REFRESH_SECRET') return 'test_jwt_refresh_secret';
        return defaultVal;
      }),
    };

    mockStorageCleanupService = {
      deleteFileByUrl: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        OtpService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: mockRefreshTokenRepo },
        { provide: getRepositoryToken(PendingRegistration), useValue: mockPendingRepo },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: StorageCleanupService, useValue: mockStorageCleanupService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    otpService = module.get<OtpService>(OtpService);
  });

  describe('register (Initiation)', () => {
    it('should create a pending registration without touching the users table', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      mockPendingRepo.findOne.mockResolvedValue(null);
      jest.spyOn(otpService, 'sendRegistrationEmail').mockResolvedValue();

      const result = await service.register({
        email: 'newuser@seedstore.com',
        password: 'Password123!',
        full_name: 'Somchai Garden',
        phone: '+66 89 123 4567',
        address: '123 Flora St, Chiang Mai',
      });

      // 1. Must NOT insert into users repository
      expect(mockUserRepo.save).not.toHaveBeenCalled();

      // 2. Must save into pendingRegistrationRepository
      expect(mockPendingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'newuser@seedstore.com',
          full_name: 'Somchai Garden',
          phone: '+66 89 123 4567',
          address: '123 Flora St, Chiang Mai',
          attempts: 0,
        }),
      );

      // 3. Response shape check
      expect(result).toEqual({
        requiresVerification: true,
        email: 'newuser@seedstore.com',
        message: expect.stringContaining('Registration initiated'),
      });
    });

    it('should reject registration if email is already registered in users table', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        id: 'existing-user-1',
        email: 'existing@seedstore.com',
        is_active: true,
        is_verified: true,
      });

      await expect(
        service.register({
          email: 'existing@seedstore.com',
          password: 'Password123!',
          full_name: 'Existing User',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPendingRepo.save).not.toHaveBeenCalled();
    });

    it('should enforce 60s cooldown if resubmitted with same email too quickly', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      mockPendingRepo.findOne.mockResolvedValue({
        id: 'pending-1',
        email: 'quick@seedstore.com',
        otp_expires_at: new Date(Date.now() + 8 * 60 * 1000),
        updated_at: new Date(Date.now() - 20 * 1000), // 20s ago
      });

      await expect(
        service.register({
          email: 'quick@seedstore.com',
          password: 'Password123!',
          full_name: 'Quick User',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update pending record with latest details after 60s cooldown', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      const existingPending = {
        id: 'pending-1',
        email: 'updated@seedstore.com',
        full_name: 'Old Name',
        otp_expires_at: new Date(Date.now() + 5 * 60 * 1000),
        updated_at: new Date(Date.now() - 75 * 1000), // 75s ago (> 60s)
        attempts: 2,
      };
      mockPendingRepo.findOne.mockResolvedValue(existingPending);
      jest.spyOn(otpService, 'sendRegistrationEmail').mockResolvedValue();

      await service.register({
        email: 'updated@seedstore.com',
        password: 'NewPassword123!',
        full_name: 'New Name',
      });

      expect(mockPendingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'updated@seedstore.com',
          full_name: 'New Name',
          attempts: 0,
        }),
      );
    });

    it('should rollback pending record if sending email fails', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);
      mockPendingRepo.findOne.mockResolvedValue(null);
      jest
        .spyOn(otpService, 'sendRegistrationEmail')
        .mockRejectedValue(new Error('SMTP Connection Refused'));

      await expect(
        service.register({
          email: 'failedmail@seedstore.com',
          password: 'Password123!',
          full_name: 'Failed Mail User',
        }),
      ).rejects.toThrow(BadRequestException);

      // Verify deletion rollback was called
      expect(mockPendingRepo.delete).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'pending-uuid-1' }),
      );
    });
  });

  describe('verifyOtpAndActivate (Completion)', () => {
    it('should verify OTP, create real user, delete pending row, and issue tokens', async () => {
      const rawCode = '654321';
      const hashedCode = otpService.hashOtp(rawCode);

      const pendingRecord = {
        id: 'pending-uuid-1',
        email: 'verify@seedstore.com',
        full_name: 'Somchai Verified',
        password_hash: '$2a$10$hashedpasswordhere',
        phone: '+66 89 999 8888',
        address: 'Chiang Mai, Thailand',
        otp_code: hashedCode,
        otp_expires_at: new Date(Date.now() + 8 * 60 * 1000),
        attempts: 0,
      };

      mockPendingRepo.findOne.mockResolvedValue(pendingRecord);

      const result = await service.verifyOtpAndActivate({
        email: 'verify@seedstore.com',
        code: rawCode,
      });

      // 1. Transaction called
      expect(mockUserRepo.manager.transaction).toHaveBeenCalled();

      // 2. Created real User entity with is_verified = true
      expect(mockEntityManager.create).toHaveBeenCalledWith(
        User,
        expect.objectContaining({
          email: 'verify@seedstore.com',
          full_name: 'Somchai Verified',
          is_verified: true,
          role: Role.CUSTOMER,
        }),
      );

      // 3. Deleted the pending record
      expect(mockEntityManager.delete).toHaveBeenCalledWith(PendingRegistration, {
        id: 'pending-uuid-1',
      });

      // 4. Saved RefreshToken entity via the transactional EntityManager
      expect(mockEntityManager.save).toHaveBeenCalledWith(
        RefreshToken,
        expect.objectContaining({
          user_id: 'user-uuid-1',
          is_revoked: false,
        }),
      );
      expect(mockRefreshTokenRepo.save).not.toHaveBeenCalled();

      // 5. Returns user and tokens
      expect(result).toHaveProperty('user');
      expect(result.user).toHaveProperty('email', 'verify@seedstore.com');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should increment attempts on invalid OTP and reject', async () => {
      const correctCode = '654321';
      const hashedCode = otpService.hashOtp(correctCode);

      const pendingRecord = {
        id: 'pending-uuid-1',
        email: 'wrong@seedstore.com',
        otp_code: hashedCode,
        otp_expires_at: new Date(Date.now() + 8 * 60 * 1000),
        attempts: 1,
      };

      mockPendingRepo.findOne.mockResolvedValue(pendingRecord);

      await expect(
        service.verifyOtpAndActivate({
          email: 'wrong@seedstore.com',
          code: '000000',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockPendingRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          attempts: 2,
        }),
      );
      expect(mockUserRepo.manager.transaction).not.toHaveBeenCalled();
    });

    it('should invalidate pending record when reaching 5 failed attempts', async () => {
      const correctCode = '654321';
      const hashedCode = otpService.hashOtp(correctCode);

      const pendingRecord = {
        id: 'pending-uuid-1',
        email: 'bruteforce@seedstore.com',
        otp_code: hashedCode,
        otp_expires_at: new Date(Date.now() + 8 * 60 * 1000),
        attempts: 4, // 5th failed attempt
      };

      mockPendingRepo.findOne.mockResolvedValue(pendingRecord);

      await expect(
        service.verifyOtpAndActivate({
          email: 'bruteforce@seedstore.com',
          code: '111111',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPendingRepo.delete).toHaveBeenCalledWith({
        id: 'pending-uuid-1',
      });
    });

    it('should reject if pending registration is not found or expired', async () => {
      mockPendingRepo.findOne.mockResolvedValue(null);

      await expect(
        service.verifyOtpAndActivate({
          email: 'nonexistent@seedstore.com',
          code: '123456',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cleanupExpiredPendingRegistrations', () => {
    it('should delete records with expired otp_expires_at', async () => {
      mockPendingRepo.delete.mockResolvedValue({ affected: 4 });

      await service.cleanupExpiredPendingRegistrations();

      expect(mockPendingRepo.delete).toHaveBeenCalledWith(
        expect.objectContaining({
          otp_expires_at: expect.anything(),
        }),
      );
    });
  });
});
