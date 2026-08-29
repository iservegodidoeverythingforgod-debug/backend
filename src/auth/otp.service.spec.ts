import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OtpService } from './otp.service';
import { BrevoClient } from '@getbrevo/brevo';

jest.mock('@getbrevo/brevo');

describe('OtpService', () => {
  let service: OtpService;
  let mockConfigService: any;
  let mockBrevoSend: jest.Mock;

  beforeEach(async () => {
    mockBrevoSend = jest.fn().mockResolvedValue({
      messageId: '<brevo_msg_12345@smtp-relay.brevo.com>',
    });

    (BrevoClient as unknown as jest.Mock).mockImplementation(() => ({
      transactionalEmails: {
        sendTransacEmail: mockBrevoSend,
      },
    }));

    mockConfigService = {
      get: jest.fn((key: string, defaultVal?: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'BREVO_API_KEY') return 'xkeysib_test_key_12345';
        if (key === 'BREVO_SENDER_EMAIL') return 'verified-sender@gmail.com';
        if (key === 'BREVO_SENDER_NAME') return 'Seed & Herb Store';
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
    it('should invoke Brevo sendTransacEmail with correct sender, recipient, and OTP code', async () => {
      const email = 'customer@example.com';
      const code = '543210';

      await service.sendRegistrationEmail(email, code);

      expect(mockBrevoSend).toHaveBeenCalledWith(
        expect.objectContaining({
          sender: {
            name: 'Seed & Herb Store',
            email: 'verified-sender@gmail.com',
          },
          to: [{ email: 'customer@example.com' }],
          subject: `${code} is your Seed & Herb Store verification code`,
          htmlContent: expect.stringContaining(code),
        }),
      );
    });

    it('should throw an error if the Brevo API rejects the request', async () => {
      mockBrevoSend.mockRejectedValue(new Error('Invalid sender address'));

      await expect(
        service.sendRegistrationEmail('invalid@domain', '123456'),
      ).rejects.toThrow('Brevo email delivery failed: Invalid sender address');
    });
  });

  describe('production startup validation', () => {
    it('should fail fast with a fatal error if BREVO_API_KEY is missing in production', () => {
      const prodConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'NODE_ENV') return 'production';
          if (key === 'BREVO_API_KEY') return undefined;
          return undefined;
        }),
      };

      expect(() => new OtpService(prodConfigService as any)).toThrow(
        'FATAL: BREVO_API_KEY environment variable is missing in production.',
      );
    });
  });
});
