import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { OrderItem } from './order-item.entity';
import { Payment } from './payment.entity';
import { OrderStatus } from '../../common/enums';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  @ManyToOne(() => User, (user) => user.orders, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ unique: true })
  order_number: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string | number) => Number(value),
    },
  })
  total_amount: number;

  @Column({
    type: 'varchar',
    default: OrderStatus.PENDING_PAYMENT,
  })
  status: OrderStatus;

  @Column()
  shipping_name: string;

  @Column({ type: 'text' })
  shipping_address: string;

  @Column()
  shipping_phone: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @OneToMany(() => OrderItem, (item) => item.order, {
    cascade: true,
    eager: true,
  })
  items: OrderItem[];

  @OneToOne(() => Payment, (payment) => payment.order, {
    cascade: true,
    eager: true,
  })
  payment: Payment;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
