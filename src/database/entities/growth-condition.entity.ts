import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { GrowthStage } from './growth-stage.entity';

export interface RuleItemOutput {
  rule: string[];
  to: string;
  statusColor: string;
  animationAssetId?: string;
}

export interface RuleItem {
  input: string[];
  output: RuleItemOutput;
}

// Legacy shape support if needed during transitions
export interface RuleExpressionItem {
  expression: string;
  output: string;
  description?: string;
  lhs?: string;
  operator?: string;
  rhs?: string | number;
}

@Entity('growth_conditions')
export class GrowthCondition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  stage_id: string;

  @ManyToOne(() => GrowthStage, (stage) => stage.conditions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'stage_id' })
  stage: GrowthStage;

  @Column()
  name: string;

  @Column({ default: 1 })
  condition_order: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  inputs: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  rules: RuleItem[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  outputs: string[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
