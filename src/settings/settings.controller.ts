import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdatePromptPaySettingDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums';

@ApiTags('Store Settings & Payment Configuration')
@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('promptpay')
  @ApiOperation({ summary: 'Admin retrieves merchant PromptPay configuration (Admin only)' })
  async getPromptPaySettings() {
    return this.settingsService.getPromptPaySettings();
  }

  @Put('promptpay')
  @ApiOperation({ summary: 'Admin updates merchant PromptPay number and account details (Admin only)' })
  async updatePromptPaySettings(
    @CurrentUser('id') adminId: string,
    @Body() dto: UpdatePromptPaySettingDto,
  ) {
    return this.settingsService.updatePromptPaySettings(adminId, dto);
  }
}
