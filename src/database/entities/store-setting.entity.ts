import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  CreateDateColumn,
} from 'typeorm';

export enum PromptPayType {
  PHONE = 'phone',
  NATIONAL_ID = 'national_id',
}

@Entity('store_settings')
export class StoreSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30, default: '0812345678' })
  promptpay_id: string;

  @Column({
    type: 'enum',
    enum: PromptPayType,
    default: PromptPayType.PHONE,
  })
  promptpay_type: PromptPayType;

  @Column({ type: 'varchar', length: 255, default: 'Organic Seed & Herb Store Co., Ltd.' })
  account_name: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at: Date;

  @Column({ type: 'varchar', length: 64, nullable: true })
  updated_by: string | null;
}
