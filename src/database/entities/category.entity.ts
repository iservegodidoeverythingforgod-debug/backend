import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import type { Product } from './product.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;


  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: 'eco' })
  icon: string;

  @OneToMany('Product', 'category')
  products: Product[];

  @CreateDateColumn()
  created_at: Date;
}
