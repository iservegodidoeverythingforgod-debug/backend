import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import * as crypto from 'crypto';
import * as nodemailer from 'nodemailer';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user,
          pass,
        },
      });

      this.logger.log(`SMTP transporter initialized using Gmail Service.`);
    } else {
      this.logger.warn(
        'SMTP credentials not fully provided. OTPs will be logged to console in Development mode.',
      );
    }
  }

  /**
   * Generates a cryptographically secure 6-digit numeric OTP
   */
  generateSecureCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  /**
   * Hashes 6-digit numeric OTP using HMAC-SHA256 with required environment secret
   */
  hashOtp(code: string): string {
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    const secret = this.configService.get<string>('OTP_HMAC_SECRET');

    if (!secret) {
      if (isProduction) {
        throw new Error('FATAL: OTP_HMAC_SECRET environment variable is missing in production.');
      }
    }

    const key = secret || 'dev_otp_hmac_secret_key_seed_store_2026';
    return crypto.createHmac('sha256', key).update(code.trim()).digest('hex');
  }

  /**
   * Constant-time timing-safe comparison of submitted OTP code against stored HMAC-SHA256 hash
   */
  verifyOtpHash(code: string, hashedCode: string): boolean {
    if (!code || !hashedCode) return false;
    const computed = this.hashOtp(code);
    try {
      const bufA = Buffer.from(computed, 'hex');
      const bufB = Buffer.from(hashedCode, 'hex');
      if (bufA.length !== bufB.length) return false;
      return crypto.timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }

  /**
   * Dispatches OTP registration email with HTML template
   */
  async sendRegistrationEmail(email: string, code: string): Promise<void> {
    const fromName = this.configService.get<string>('SMTP_FROM_NAME', 'Seed & Herb Store');
    const fromEmail = this.configService.get<string>('SMTP_FROM_EMAIL', 'noreply@seedstore.com');

    const htmlContent = `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px; background-color: #FAFAF7; border-radius: 16px; border: 1px solid #EAEAE4;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #2D5A27; margin: 0; font-size: 24px;">🌿 Seed & Herb Store</h2>
          <p style="color: #718096; font-size: 14px; margin-top: 4px;">Account Email Verification</p>
        </div>
        <div style="background-color: #FFFFFF; padding: 28px; border-radius: 12px; border: 1px solid #E2E8F0; text-align: center;">
          <p style="color: #2D3748; font-size: 15px; line-height: 1.5; margin-bottom: 20px;">
            Thank you for registering! Please use the 6-digit verification code below to activate your account.
          </p>
          <div style="background-color: #E8F5E9; color: #2D5A27; font-size: 32px; font-weight: 800; letter-spacing: 8px; padding: 14px 20px; border-radius: 8px; display: inline-block; margin-bottom: 20px;">
            ${code}
          </div>
          <p style="color: #A0AEC0; font-size: 12px; margin: 0;">
            This code will expire in <strong>10 minutes</strong>. If you did not request this code, you can safely ignore this email.
          </p>
        </div>
      </div>
    `;

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: email,
          subject: `${code} is your Seed & Herb Store verification code`,
          html: htmlContent,
        });
        this.logger.log(`OTP email sent successfully to ${email}`);
      } catch (err: any) {
        this.logger.error(`Failed to send email to ${email}: ${err.message}`);
        // If in development mode without working credentials, log fallback
        if (this.configService.get<string>('NODE_ENV') !== 'production') {
          this.logger.log(`[DEV OTP FALLBACK] Code for ${email} is: ${code}`);
          return;
        }
        throw err;
      }
    } else {
      this.logger.log(`[DEV MODE - NO SMTP] Verification Code for ${email}: >>> ${code} <<<`);
    }
  }
}
