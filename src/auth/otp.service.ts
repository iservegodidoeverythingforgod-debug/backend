import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import * as nodemailer from 'nodemailer';

interface OtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
}

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly otpStore = new Map<string, OtpRecord>();
  private transporter: nodemailer.Transporter | null = null;

  // Security Configuration Constants
  private readonly OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes validity
  private readonly RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds cooldown
  private readonly MAX_VERIFY_ATTEMPTS = 5; // Max 5 wrong guesses before invalidation

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail', // ใส่คำนี้คำเดียวแทนการระบุ Host และ Port
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
  private generateSecureCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  /**
   * Dispatches an OTP to the given email with cooldown and anti-spam enforcement
   */
  async sendOtp(
    email: string,
    purpose: 'REGISTRATION' | 'PASSWORD_RESET' = 'REGISTRATION',
  ): Promise<{ success: boolean; cooldownSeconds: number }> {
    const normalizedEmail = email.toLowerCase().trim();
    const now = Date.now();
    const existing = this.otpStore.get(normalizedEmail);

    // Enforce 60-second resend cooldown
    if (existing && now - existing.lastSentAt < this.RESEND_COOLDOWN_MS) {
      const remainingSec = Math.ceil((this.RESEND_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000);
      throw new BadRequestException(
        `Please wait ${remainingSec} seconds before requesting a new verification code.`,
      );
    }

    const code = this.generateSecureCode();
    this.otpStore.set(normalizedEmail, {
      code,
      expiresAt: now + this.OTP_TTL_MS,
      attempts: 0,
      lastSentAt: now,
    });

    await this.dispatchEmail(normalizedEmail, code, purpose);

    return {
      success: true,
      cooldownSeconds: 60,
    };
  }

  /**
   * Verifies the submitted OTP against the store with brute-force attempt tracking
   */
  async verifyOtp(email: string, code: string): Promise<boolean> {
    const normalizedEmail = email.toLowerCase().trim();
    const record = this.otpStore.get(normalizedEmail);

    if (!record) {
      throw new BadRequestException('Verification code has expired or was not requested. Please request a new one.');
    }

    // Check expiration
    if (Date.now() > record.expiresAt) {
      this.otpStore.delete(normalizedEmail);
      throw new BadRequestException('Verification code has expired. Please request a new one.');
    }

    // Check attempt threshold
    if (record.attempts >= this.MAX_VERIFY_ATTEMPTS) {
      this.otpStore.delete(normalizedEmail);
      throw new UnauthorizedException(
        'Too many failed attempts. This code has been invalidated. Please request a new one.',
      );
    }

    if (record.code !== code.trim()) {
      record.attempts += 1;
      const remaining = this.MAX_VERIFY_ATTEMPTS - record.attempts;
      throw new BadRequestException(
        `Invalid verification code. ${remaining} attempt(s) remaining.`,
      );
    }

    // Code verified: consume and delete from store
    this.otpStore.delete(normalizedEmail);
    return true;
  }

  /**
   * HTML Email Dispatcher
   */
  private async dispatchEmail(email: string, code: string, purpose: string) {
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
            This code will expire in <strong>5 minutes</strong>. If you did not request this code, you can safely ignore this email.
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
        this.logger.log(`[DEV OTP FALLBACK] Code for ${email} is: ${code}`);
      }
    } else {
      this.logger.log(`[DEV MODE - NO SMTP] Verification Code for ${email}: >>> ${code} <<<`);
    }
  }
}
