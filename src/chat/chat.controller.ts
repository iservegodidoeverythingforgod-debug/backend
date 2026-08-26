import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { CreateConversationDto, SendMessageDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums';

@ApiTags('Customer Support Chat')
@Controller('chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CUSTOMER, Role.USER)
@ApiBearerAuth()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('conversations')
  @ApiOperation({ summary: 'Start a new support conversation or send initial message' })
  async createConversation(
    @CurrentUser('id') customerId: string,
    @Body() dto: CreateConversationDto,
  ) {
    return this.chatService.createCustomerConversation(customerId, dto);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List all conversations for the authenticated customer' })
  async getConversations(@CurrentUser('id') customerId: string) {
    return this.chatService.getCustomerConversations(customerId);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get single conversation messages & detail' })
  async getConversationById(
    @CurrentUser('id') customerId: string,
    @Param('id') id: string,
  ) {
    return this.chatService.getCustomerConversationById(customerId, id);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message in a conversation as Customer' })
  async sendMessage(
    @CurrentUser('id') customerId: string,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendCustomerMessage(customerId, id, dto);
  }

  @Patch('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all unread admin messages in conversation as read' })
  async markAsRead(
    @CurrentUser('id') customerId: string,
    @Param('id') id: string,
  ) {
    return this.chatService.markCustomerConversationAsRead(customerId, id);
  }

  @Patch('conversations/:id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a customer support conversation' })
  async closeConversation(
    @CurrentUser('id') customerId: string,
    @Param('id') id: string,
  ) {
    return this.chatService.closeCustomerConversation(customerId, id);
  }
}
