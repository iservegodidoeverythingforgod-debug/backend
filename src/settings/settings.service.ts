import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StoreSetting, PromptPayType } from '../database/entities/store-setting.entity';
import { UpdatePromptPaySettingDto } from './dto';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    @InjectRepository(StoreSetting)
    private readonly storeSettingRepository: Repository<StoreSetting>,
  ) {}

  /**
   * Retrieves the current store PromptPay settings (singleton).
   */
  async getPromptPaySettings(): Promise<StoreSetting> {
    const settings = await this.storeSettingRepository.find({
      order: { created_at: 'ASC' },
      take: 1,
    });
    let setting = settings.length > 0 ? settings[0] : null;

    if (!setting) {
      this.logger.log('Creating initial singleton store settings...');
      setting = this.storeSettingRepository.create({
        promptpay_id: '0812345678',
        promptpay_type: PromptPayType.PHONE,
        account_name: 'Organic Seed & Herb Store Co., Ltd.',
      });
      setting = await this.storeSettingRepository.save(setting);
    }

    return setting;
  }

  /**
   * Updates the merchant PromptPay configuration.
   */
  async updatePromptPaySettings(
    userId: string,
    dto: UpdatePromptPaySettingDto,
  ): Promise<StoreSetting> {
    const setting = await this.getPromptPaySettings();

    setting.promptpay_id = dto.promptpay_id.trim();
    setting.promptpay_type = dto.promptpay_type;
    if (dto.account_name !== undefined) {
      setting.account_name = dto.account_name.trim();
    }
    setting.updated_by = userId;
    setting.updated_at = new Date();

    return this.storeSettingRepository.save(setting);
  }
}
