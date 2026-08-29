import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto';
import { BulkDeleteDto } from '../common/dto/bulk-delete.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums';
import { ConversationStatus } from '../database/entities/chat-conversation.entity';

@ApiTags('Admin Support Inbox')
@Controller('admin/chat')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List all customer support conversations (Admin only)' })
  @ApiQuery({ name: 'status', enum: ConversationStatus, required: false })
  async getConversations(@Query('status') status?: ConversationStatus) {
    return this.chatService.getAdminConversations(status);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get single conversation detail with customer details' })
  async getConversationById(@Param('id') id: string) {
    return this.chatService.getAdminConversationById(id);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Reply to customer conversation as Admin' })
  async sendMessage(
    @CurrentUser('id') adminId: string,
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendAdminMessage(adminId, id, dto);
  }

  @Patch('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all customer messages in conversation as read by Admin' })
  async markAsRead(@Param('id') id: string) {
    return this.chatService.markAdminConversationAsRead(id);
  }

  @Patch('conversations/:id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a customer conversation as Admin' })
  async closeConversation(@Param('id') id: string) {
    return this.chatService.closeAdminConversation(id);
  }

  @Patch('conversations/:id/reopen')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reopen a closed conversation as Admin' })
  async reopenConversation(@Param('id') id: string) {
    return this.chatService.reopenAdminConversation(id);
  }

  @Delete('conversations/:id')
  @ApiOperation({ summary: 'Delete a single conversation and its messages (Admin only)' })
  async deleteConversation(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.chatService.deleteConversation(id, adminId);
  }

  @Post('conversations/bulk-delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk delete support conversations and their messages (Admin only)' })
  async bulkDeleteConversations(
    @Body() dto: BulkDeleteDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.chatService.bulkDeleteConversations(dto.ids, adminId);
  }
}
