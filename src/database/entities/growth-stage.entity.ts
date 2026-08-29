import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import type { GrowthRule } from './growth-rule.entity';
import type { GrowthCondition } from './growth-condition.entity';
import type { AnimationAsset } from './animation-asset.entity';

@Entity('growth_stages')
export class GrowthStage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  rule_id: string;

  @ManyToOne('GrowthRule', 'stages', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'rule_id' })
  rule: GrowthRule;

  @Column()
  stage_name: string;

  @Column({ default: 1 })
  stage_order: number;

  @Column({ type: 'uuid', nullable: true })
  animation_asset_id?: string | null;

  @ManyToOne('AnimationAsset', {
    nullable: true,
    onDelete: 'SET NULL',
    eager: true,
  })
  @JoinColumn({ name: 'animation_asset_id' })
  animation_asset?: AnimationAsset;

  // Legacy string column retained temporarily for backwards compatibility
  @Column({ default: 'foliage_lush' })
  animation: string;

  @Column({ default: 1 })
  min_day: number;

  @Column({ default: 10 })
  max_day: number;

  // Convenient aliases for startDay / endDay
  get start_day(): number {
    return this.min_day;
  }
  set start_day(val: number) {
    this.min_day = val;
  }

  get end_day(): number {
    return this.max_day;
  }
  set end_day(val: number) {
    this.max_day = val;
  }

  get startDay(): number {
    return this.min_day;
  }

  get endDay(): number {
    return this.max_day;
  }

  get animationAssetId(): string | null | undefined {
    return this.animation_asset_id;
  }
  set animationAssetId(val: string | null | undefined) {
    this.animation_asset_id = val || null;
  }

  get animationAssetUrl(): string | undefined {
    return this.animation_asset?.file_url;
  }

  @OneToMany('GrowthCondition', 'stage', {
    cascade: true,
    eager: true,
  })
  conditions: GrowthCondition[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
