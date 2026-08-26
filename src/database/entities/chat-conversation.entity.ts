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
import { User } from './user.entity';
import { ChatMessage } from './chat-message.entity';

export enum ConversationStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

@Entity('chat_conversations')
export class ChatConversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  customer_id: string;

  @ManyToOne(() => User, (user) => user.conversations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: User;

  @Column({
    type: 'varchar',
    default: ConversationStatus.OPEN,
  })
  status: ConversationStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subject?: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  last_message_at?: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => ChatMessage, (message) => message.conversation)
  messages: ChatMessage[];
}
