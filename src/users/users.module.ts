import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from '../database/entities/user.entity';
import { Order } from '../database/entities/order.entity';
import { Review } from '../database/entities/review.entity';
import { ChatConversation } from '../database/entities/chat-conversation.entity';
import { ChatMessage } from '../database/entities/chat-message.entity';
import { Payment } from '../database/entities/payment.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Order,
      Review,
      ChatConversation,
      ChatMessage,
      Payment,
      RefreshToken,
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
