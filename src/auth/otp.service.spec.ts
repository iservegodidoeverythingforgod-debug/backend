import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';
import { Resend } from 'resend';

jest.mock('resend');

describe('OtpService', () => {
  let service: OtpService;
  let mockConfigService: any;
  let mockResendSend: jest.Mock;

  beforeEach(async () => {
    mockResendSend = jest.fn().mockResolvedValue({
      data: { id: 'resend_msg_12345' },
      error: null,
    });

    (Resend as unknown as jest.Mock).mockImplementation(() => ({
      emails: {
        send: mockResendSend,
      },
    }));

    mockConfigService = {
      get: jest.fn((key: string, defaultVal?: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'RESEND_API_KEY') return 're_test_key_12345';
        if (key === 'RESEND_FROM_EMAIL') return 'Seed Store <onboarding@resend.dev>';
        if (key === 'OTP_HMAC_SECRET') return 'test_hmac_secret_key';
        return defaultVal;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<OtpService>(OtpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateSecureCode', () => {
    it('should generate a 6-digit numeric string', () => {
      const code = service.generateSecureCode();
      expect(code).toMatch(/^\d{6}$/);
    });
  });

  describe('hashOtp and verifyOtpHash', () => {
    it('should hash and correctly verify matching code', () => {
      const code = '789123';
      const hash = service.hashOtp(code);
      expect(hash).toHaveLength(64); // SHA-256 hex
      expect(service.verifyOtpHash(code, hash)).toBe(true);
    });

    it('should return false for incorrect code', () => {
      const code = '789123';
      const hash = service.hashOtp(code);
      expect(service.verifyOtpHash('000000', hash)).toBe(false);
    });
  });

  describe('sendRegistrationEmail', () => {
    it('should invoke Resend emails.send with correct recipient, from address, and OTP code', async () => {
      const email = 'customer@example.com';
      const code = '543210';

      await service.sendRegistrationEmail(email, code);

      expect(mockResendSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Seed Store <onboarding@resend.dev>',
          to: 'customer@example.com',
          subject: `${code} is your Seed & Herb Store verification code`,
          html: expect.stringContaining(code),
        }),
      );
    });

    it('should throw an error if the Resend API returns an error object', async () => {
      mockResendSend.mockResolvedValue({
        data: null,
        error: {
          name: 'validation_error',
          message: 'The recipient address is invalid',
        },
      });

      await expect(
        service.sendRegistrationEmail('invalid@domain', '123456'),
      ).rejects.toThrow('Resend email delivery failed: The recipient address is invalid');
    });
  });

  describe('production startup validation', () => {
    it('should fail fast with a fatal error if RESEND_API_KEY is missing in production', () => {
      const prodConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'NODE_ENV') return 'production';
          if (key === 'RESEND_API_KEY') return undefined;
          return undefined;
        }),
      };

      expect(() => new OtpService(prodConfigService as any)).toThrow(
        'FATAL: RESEND_API_KEY environment variable is missing in production.',
      );
    });
  });
});
