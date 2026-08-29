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
import type { Category } from './category.entity';
import type { Review } from './review.entity';
import type { OrderItem } from './order-item.entity';
import type { GrowthRule } from './growth-rule.entity';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  category_id: string;

  @ManyToOne('Category', 'products', {
    onDelete: 'SET NULL',
    eager: true,
  })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column({ nullable: true })
  rule_id: string;

  @ManyToOne('GrowthRule', 'products', {
    onDelete: 'SET NULL',
    eager: true,
  })
  @JoinColumn({ name: 'rule_id' })
  growth_rule: GrowthRule;

  @Column()
  name: string;

  @Column({ nullable: true })
  scientific_name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  detailed_description: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) => Number(value),
    },
  })
  price: number;

  @Column({ default: 0 })
  stock: number;

  @Column({ nullable: true })
  image_url: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  images: string[];

  @Column({ default: 'Easy' })
  difficulty: string; // Easy, Moderate, Challenging

  @Column({ default: 7 })
  germination_days: number;

  @Column({ default: 60 })
  harvest_days: number;

  @Column({ default: true })
  is_active: boolean;

  @OneToMany('Review', 'product')
  reviews: Review[];

  @OneToMany('OrderItem', 'product')
  order_items: OrderItem[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
