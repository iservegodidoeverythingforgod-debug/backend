import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import type { GrowthStage } from './growth-stage.entity';
import type { Product } from './product.entity';

export type InputType = 'number' | 'enum';

export interface InputDefinition {
  key: string;
  type: InputType;
  min?: number;
  max?: number;
  default?: number | string;
  enumValues?: string[];
}

@Entity('growth_rules')
export class GrowthRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: false })
  is_default: boolean;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  input_definitions: InputDefinition[];

  @OneToMany('GrowthStage', 'rule', {
    cascade: true,
    eager: true,
  })
  stages: GrowthStage[];

  @OneToMany('Product', 'growth_rule')
  products: Product[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
