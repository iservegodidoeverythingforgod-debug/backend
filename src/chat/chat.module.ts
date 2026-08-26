import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatConversation } from '../database/entities/chat-conversation.entity';
import { ChatMessage } from '../database/entities/chat-message.entity';
import { User } from '../database/entities/user.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { AdminChatController } from './admin-chat.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatConversation, ChatMessage, User]),
  ],
  controllers: [ChatController, AdminChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
