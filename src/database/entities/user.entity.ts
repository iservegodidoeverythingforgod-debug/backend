import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Role } from '../../common/enums';
import type { RefreshToken } from './refresh-token.entity';
import type { Order } from './order.entity';
import type { Review } from './review.entity';
import type { ChatConversation } from './chat-conversation.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ select: false })
  password_hash: string;

  @Column()
  full_name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ nullable: true })
  avatar_url: string;

  @Column({
    type: 'varchar',
    default: Role.CUSTOMER,
  })
  role: Role;

  @Column({ default: true })
  is_active: boolean;

  @Column({ default: false })
  is_verified: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  verified_at: Date;

  @OneToMany('RefreshToken', 'user')
  refresh_tokens: RefreshToken[];

  @OneToMany('Order', 'user')
  orders: Order[];

  @OneToMany('Review', 'user')
  reviews: Review[];

  @OneToMany('ChatConversation', 'customer')
  conversations: ChatConversation[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
