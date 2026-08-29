import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { User } from '../database/entities/user.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { PendingRegistration } from '../database/entities/pending-registration.entity';
import { StorageCleanupService } from '../common/storage/storage-cleanup.service';
import { Role } from '../common/enums';

describe('AuthService - Transactional Foreign Key Integrity Regression Test', () => {
  let service: AuthService;
  let otpService: OtpService;

  // In-memory simulated transactional database state to verify strict foreign key constraints
  const databaseState = {
    users: new Map<string, any>(),
    pending: new Map<string, any>(),
    refreshTokens: new Map<string, any>(),
  };

  beforeEach(async () => {
    databaseState.users.clear();
    databaseState.pending.clear();
    databaseState.refreshTokens.clear();

    const mockTransactionalManager = {
      findOne: jest.fn().mockImplementation((entityClass, options) => {
        if (entityClass === User) {
          const email = options?.where?.email;
          for (const u of databaseState.users.values()) {
            if (u.email === email) return u;
          }
          return null;
        }
        return null;
      }),
      create: jest.fn().mockImplementation((entityClass, dto) => {
        return { id: `generated-uuid-${Date.now()}`, ...dto };
      }),
      save: jest.fn().mockImplementation((entityClassOrEntity, entityObj) => {
        const entity = entityObj || entityClassOrEntity;
        const targetClass = entityObj ? entityClassOrEntity : entity.constructor;

        if (targetClass === User || entity.email !== undefined) {
          databaseState.users.set(entity.id, entity);
          return Promise.resolve(entity);
        }

        if (targetClass === RefreshToken || entity.token_hash !== undefined) {
          // STRICT FK VALIDATION: Foreign key must exist in users table
          if (!databaseState.users.has(entity.user_id)) {
            throw new Error(
              `insert or update on table "refresh_tokens" violates foreign key constraint "FK_refresh_tokens_user"`,
            );
          }
          databaseState.refreshTokens.set(entity.id || `rt-${Date.now()}`, entity);
          return Promise.resolve(entity);
        }

        return Promise.resolve(entity);
      }),
      delete: jest.fn().mockImplementation((entityClass, criteria) => {
        if (entityClass === PendingRegistration) {
          databaseState.pending.delete(criteria.id);
          return Promise.resolve({ affected: 1 });
        }
        return Promise.resolve({ affected: 0 });
      }),
    };

    const mockUserRepo = {
      findOne: jest.fn(),
      manager: {
        transaction: jest.fn().mockImplementation(async (callback) => {
          return callback(mockTransactionalManager);
        }),
      },
    };

    const mockRefreshTokenRepo = {
      create: jest.fn().mockImplementation((dto) => {
        return { id: `rt-${Date.now()}`, ...dto };
      }),
      save: jest.fn().mockImplementation((entity) => {
        // If this global repo is called directly while user is uncommitted, simulate FK failure
        if (!databaseState.users.has(entity.user_id)) {
          throw new Error(
            `insert or update on table "refresh_tokens" violates foreign key constraint "FK_refresh_tokens_user"`,
          );
        }
        databaseState.refreshTokens.set(entity.id, entity);
        return Promise.resolve(entity);
      }),
    };

    const mockPendingRepo = {
      findOne: jest.fn().mockImplementation((options) => {
        const email = options?.where?.email;
        for (const p of databaseState.pending.values()) {
          if (p.email === email) return p;
        }
        return null;
      }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn().mockImplementation((p) => {
        databaseState.pending.set(p.id, p);
        return Promise.resolve(p);
      }),
    };

    const mockJwtService = {
      sign: jest.fn().mockReturnValue('mock.jwt.token'),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultVal?: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'OTP_HMAC_SECRET') return 'test_hmac_secret_key';
        return defaultVal;
      }),
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
        { provide: StorageCleanupService, useValue: { deleteFileByUrl: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    otpService = module.get<OtpService>(OtpService);
  });

  it('should successfully execute verifyOtpAndActivate without FK violation', async () => {
    const rawOtp = '123456';
    const hashedOtp = otpService.hashOtp(rawOtp);

    const pendingRow = {
      id: 'pending-uuid-999',
      email: 'fktest@seedstore.com',
      full_name: 'FK Test User',
      password_hash: 'hashed_password_sample',
      phone: '+66 89 000 1111',
      address: 'Bangkok, Thailand',
      otp_code: hashedOtp,
      otp_expires_at: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0,
    };

    databaseState.pending.set(pendingRow.id, pendingRow);

    // Call verifyOtpAndActivate
    const result = await service.verifyOtpAndActivate({
      email: 'fktest@seedstore.com',
      code: rawOtp,
    });

    // Assert that the user was created
    expect(result.user).toBeDefined();
    expect(result.user.email).toBe('fktest@seedstore.com');
    expect(result.user.role).toBe(Role.CUSTOMER);

    // Assert that tokens were generated
    expect(result.accessToken).toBe('mock.jwt.token');
    expect(result.refreshToken).toBe('mock.jwt.token');

    // Assert that pending registration was deleted
    expect(databaseState.pending.has('pending-uuid-999')).toBe(false);

    // Assert that user and refresh token exist in DB state
    expect(databaseState.users.size).toBe(1);
    expect(databaseState.refreshTokens.size).toBe(1);
  });
});
