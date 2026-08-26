import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { VerifyPaymentDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums';
import { SupabaseStorageService } from '../common/storage/supabase-storage.service';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';

@ApiTags('Payments & QR Slip Verification')
@Controller('payments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly supabaseStorageService: SupabaseStorageService,
  ) {}

  @Get('qr-details/:orderId')
  @ApiOperation({ summary: 'Get PromptPay QR payment metadata for checkout' })
  async getPaymentDetails(@Param('orderId') orderId: string) {
    return this.paymentsService.getPaymentDetails(orderId);
  }

  @Get('promptpay-qr/:orderId')
  @ApiOperation({ summary: 'Get PromptPay QR payment metadata (alias)' })
  async getPromptPayQr(@Param('orderId') orderId: string) {
    return this.paymentsService.getPaymentDetails(orderId);
  }

  @Post('upload-slip/:orderId')
  @UseGuards(RolesGuard)
  @Roles(Role.CUSTOMER, Role.USER)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Customer uploads bank payment slip image (Customer only)' })
  @UseInterceptors(
    FileInterceptor('slip', {
      storage: memoryStorage(),
      limits: { fileSize: 3 * 1024 * 1024 }, // 3MB limit for slips bucket
    }),
  )
  async uploadSlip(
    @Param('orderId') orderId: string,
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Please upload a valid payment slip image file');
    }
    const ext = extname(file.originalname).toLowerCase() || '.jpg';
    const key = `${orderId}/${randomUUID()}${ext}`;
    const slipUrl = await this.supabaseStorageService.uploadFile(
      'slips',
      key,
      file.buffer,
      file.mimetype || 'image/jpeg',
    );
    return this.paymentsService.submitSlip(orderId, slipUrl, userId);
  }

  @Patch(':id/verify')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin inspects and verifies or rejects payment slip (Admin only)' })
  async verifyPayment(
    @Param('id') paymentId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.paymentsService.verifyPayment(paymentId, adminId, dto);
  }
}
