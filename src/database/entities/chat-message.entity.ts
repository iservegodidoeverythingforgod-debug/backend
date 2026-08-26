import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ChatConversation } from './chat-conversation.entity';
import { User } from './user.entity';

export enum SenderType {
  CUSTOMER = 'CUSTOMER',
  ADMIN = 'ADMIN',
}

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  conversation_id: string;

  @ManyToOne(() => ChatConversation, (conv) => conv.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: ChatConversation;

  @Column({
    type: 'varchar',
    default: SenderType.CUSTOMER,
  })
  sender_type: SenderType;

  @Column({ type: 'uuid' })
  sender_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  read_at?: Date;

  @CreateDateColumn()
  created_at: Date;
}
