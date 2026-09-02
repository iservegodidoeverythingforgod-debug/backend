import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import {
  ChatConversation,
  ConversationStatus,
} from '../database/entities/chat-conversation.entity';
import {
  ChatMessage,
  SenderType,
} from '../database/entities/chat-message.entity';
import { User } from '../database/entities/user.entity';
import { CreateConversationDto, SendMessageDto } from './dto';
import { BulkDeleteResult, FailedItem } from '../common/dto/bulk-delete.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(ChatConversation)
    private readonly convRepo: Repository<ChatConversation>,
    @InjectRepository(ChatMessage)
    private readonly msgRepo: Repository<ChatMessage>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  // ==========================================
  // CUSTOMER CHAT METHODS
  // ==========================================

  /**
   * Start a new conversation or post initial message in an active conversation
   */
  async createCustomerConversation(
    customerId: string,
    dto: CreateConversationDto,
  ): Promise<{ conversation: ChatConversation; message: ChatMessage }> {
    const trimmedMsg = dto.message?.trim();
    if (!trimmedMsg) {
      throw new BadRequestException('Message cannot be empty');
    }

    return this.convRepo.manager.transaction(async (em) => {
      // Check if customer already has an OPEN conversation
      let conversation = await em.findOne(ChatConversation, {
        where: {
          customer_id: customerId,
          status: ConversationStatus.OPEN,
        },
        order: { updated_at: 'DESC' },
      });

      const now = new Date();

      if (!conversation) {
        // If customer has a CLOSED conversation, block starting a new conversation until admin reopens or deletes it
        const closedConversation = await em.findOne(ChatConversation, {
          where: {
            customer_id: customerId,
            status: ConversationStatus.CLOSED,
          },
          order: { updated_at: 'DESC' },
        });

        if (closedConversation) {
          throw new BadRequestException(
            'Your support conversation has been closed. Please wait for the admin to reopen or delete the conversation before starting a new chat.',
          );
        }

        conversation = em.create(ChatConversation, {
          customer_id: customerId,
          status: ConversationStatus.OPEN,
          subject: dto.subject?.trim() || 'General Customer Support',
          last_message_at: now,
        });
        conversation = await em.save(ChatConversation, conversation);
      } else {
        conversation.last_message_at = now;
        if (dto.subject?.trim()) {
          conversation.subject = dto.subject.trim();
        }
        conversation = await em.save(ChatConversation, conversation);
      }

      // Create message
      const message = em.create(ChatMessage, {
        conversation_id: conversation.id,
        sender_type: SenderType.CUSTOMER,
        sender_id: customerId,
        message: trimmedMsg,
      });

      const savedMessage = await em.save(ChatMessage, message);

      return {
        conversation,
        message: savedMessage,
      };
    });
  }

  /**
   * List all conversations for the authenticated customer
   */
  async getCustomerConversations(customerId: string) {
    const conversations = await this.convRepo.find({
      where: { customer_id: customerId },
      order: { last_message_at: 'DESC' },
    });

    if (conversations.length === 0) return [];
    const convIds = conversations.map((c) => c.id);

    // 1. Unread counts from admin via SQL GROUP BY
    const unreadRaw = await this.msgRepo
      .createQueryBuilder('msg')
      .select('msg.conversation_id', 'convId')
      .addSelect('COUNT(msg.id)', 'count')
      .where('msg.conversation_id IN (:...convIds)', { convIds })
      .andWhere('msg.sender_type = :senderType', { senderType: SenderType.ADMIN })
      .andWhere('msg.read_at IS NULL')
      .groupBy('msg.conversation_id')
      .getRawMany();

    const unreadMap = new Map<string, number>(
      unreadRaw.map((r) => [r.convId, parseInt(r.count, 10)]),
    );

    // 2. Fetch latest messages for each conversation
    const messages = await this.msgRepo
      .createQueryBuilder('msg')
      .where('msg.conversation_id IN (:...convIds)', { convIds })
      .orderBy('msg.created_at', 'DESC')
      .getMany();

    const lastMessageMap = new Map<string, ChatMessage>();
    for (const m of messages) {
      if (!lastMessageMap.has(m.conversation_id)) {
        lastMessageMap.set(m.conversation_id, m);
      }
    }

    return conversations.map((conv) => {
      const { ...safeConv } = conv;
      return {
        ...safeConv,
        unread_count: unreadMap.get(conv.id) || 0,
        last_message: lastMessageMap.get(conv.id) || null,
        messages: [],
      };
    });
  }

  /**
   * Get single conversation details & full messages for the authenticated customer
   */
  async getCustomerConversationById(customerId: string, conversationId: string) {
    const conversation = await this.convRepo.findOne({
      where: { id: conversationId },
      relations: ['messages', 'messages.sender', 'customer'],
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    // Strict customer authorization check
    if (conversation.customer_id !== customerId) {
      throw new ForbiddenException('You do not have permission to access this conversation');
    }

    const sortedMessages = (conversation.messages || []).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    return {
      ...conversation,
      messages: sortedMessages.map((m) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        sender_type: m.sender_type,
        sender_id: m.sender_id,
        sender_name: m.sender?.full_name || (m.sender_type === SenderType.ADMIN ? 'Support Admin' : 'Customer'),
        message: m.message,
        read_at: m.read_at,
        created_at: m.created_at,
      })),
    };
  }

  /**
   * Send a new message in an existing conversation as Customer
   */
  async sendCustomerMessage(
    customerId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<ChatMessage> {
    const trimmedMsg = dto.message?.trim();
    if (!trimmedMsg) {
      throw new BadRequestException('Message cannot be empty');
    }

    const conversation = await this.convRepo.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    if (conversation.customer_id !== customerId) {
      throw new ForbiddenException('You do not have permission to post to this conversation');
    }

    // Reject message sending if conversation is closed
    if (conversation.status === ConversationStatus.CLOSED) {
      throw new BadRequestException(
        'This conversation is closed and no longer accepting messages. Please wait for the admin to reopen or delete the conversation.',
      );
    }

    const now = new Date();
    conversation.last_message_at = now;
    await this.convRepo.save(conversation);

    const message = this.msgRepo.create({
      conversation_id: conversation.id,
      sender_type: SenderType.CUSTOMER,
      sender_id: customerId,
      message: trimmedMsg,
    });

    return this.msgRepo.save(message);
  }

  /**
   * Mark all unread Admin messages in conversation as read by Customer
   */
  async markCustomerConversationAsRead(customerId: string, conversationId: string) {
    const conversation = await this.convRepo.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    if (conversation.customer_id !== customerId) {
      throw new ForbiddenException('You do not have permission to update this conversation');
    }

    await this.msgRepo
      .createQueryBuilder()
      .update(ChatMessage)
      .set({ read_at: new Date() })
      .where('conversation_id = :convId AND sender_type = :senderType AND read_at IS NULL', {
        convId: conversationId,
        senderType: SenderType.ADMIN,
      })
      .execute();

    return { success: true };
  }

  /**
   * Close a customer conversation
   */
  async closeCustomerConversation(customerId: string, conversationId: string) {
    const conversation = await this.convRepo.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    if (conversation.customer_id !== customerId) {
      throw new ForbiddenException('You do not have permission to close this conversation');
    }

    conversation.status = ConversationStatus.CLOSED;
    return this.convRepo.save(conversation);
  }

  // ==========================================
  // ADMIN CHAT METHODS
  // ==========================================

  /**
   * List all conversations for Admin with optional status filter
   */
  async getAdminConversations(status?: ConversationStatus) {
    const qb = this.convRepo
      .createQueryBuilder('conv')
      .leftJoinAndSelect('conv.customer', 'customer')
      .orderBy('conv.last_message_at', 'DESC');

    if (status) {
      qb.andWhere('conv.status = :status', { status });
    }

    const conversations = await qb.getMany();
    if (conversations.length === 0) return [];
    const convIds = conversations.map((c) => c.id);

    // 1. Unread counts from customer via SQL GROUP BY
    const unreadRaw = await this.msgRepo
      .createQueryBuilder('msg')
      .select('msg.conversation_id', 'convId')
      .addSelect('COUNT(msg.id)', 'count')
      .where('msg.conversation_id IN (:...convIds)', { convIds })
      .andWhere('msg.sender_type = :senderType', { senderType: SenderType.CUSTOMER })
      .andWhere('msg.read_at IS NULL')
      .groupBy('msg.conversation_id')
      .getRawMany();

    const unreadMap = new Map<string, number>(
      unreadRaw.map((r) => [r.convId, parseInt(r.count, 10)]),
    );

    // 2. Fetch latest messages for each conversation
    const messages = await this.msgRepo
      .createQueryBuilder('msg')
      .where('msg.conversation_id IN (:...convIds)', { convIds })
      .orderBy('msg.created_at', 'DESC')
      .getMany();

    const lastMessageMap = new Map<string, ChatMessage>();
    for (const m of messages) {
      if (!lastMessageMap.has(m.conversation_id)) {
        lastMessageMap.set(m.conversation_id, m);
      }
    }

    return conversations.map((conv) => {
      return {
        id: conv.id,
        customer_id: conv.customer_id,
        customer_name: conv.customer?.full_name || 'Customer',
        customer_email: conv.customer?.email || '',
        customer_avatar: conv.customer?.avatar_url || null,
        status: conv.status,
        subject: conv.subject,
        last_message_at: conv.last_message_at,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        unread_count: unreadMap.get(conv.id) || 0,
        last_message: lastMessageMap.get(conv.id) || null,
        messages: [],
      };
    });
  }

  /**
   * Get single conversation for Admin
   */
  async getAdminConversationById(conversationId: string) {
    const conversation = await this.convRepo.findOne({
      where: { id: conversationId },
      relations: ['messages', 'messages.sender', 'customer'],
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const sortedMessages = (conversation.messages || []).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    return {
      id: conversation.id,
      customer_id: conversation.customer_id,
      customer_name: conversation.customer?.full_name || 'Customer',
      customer_email: conversation.customer?.email || '',
      customer_phone: conversation.customer?.phone || null,
      customer_avatar: conversation.customer?.avatar_url || null,
      status: conversation.status,
      subject: conversation.subject,
      last_message_at: conversation.last_message_at,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      messages: sortedMessages.map((m) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        sender_type: m.sender_type,
        sender_id: m.sender_id,
        sender_name: m.sender?.full_name || (m.sender_type === SenderType.ADMIN ? 'Support Admin' : 'Customer'),
        message: m.message,
        read_at: m.read_at,
        created_at: m.created_at,
      })),
    };
  }

  /**
   * Send a reply as Admin
   */
  async sendAdminMessage(
    adminId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<ChatMessage> {
    const trimmedMsg = dto.message?.trim();
    if (!trimmedMsg) {
      throw new BadRequestException('Message cannot be empty');
    }

    const conversation = await this.convRepo.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const now = new Date();
    conversation.last_message_at = now;
    await this.convRepo.save(conversation);

    const message = this.msgRepo.create({
      conversation_id: conversation.id,
      sender_type: SenderType.ADMIN,
      sender_id: adminId,
      message: trimmedMsg,
    });

    return this.msgRepo.save(message);
  }

  /**
   * Mark all unread Customer messages in conversation as read by Admin
   */
  async markAdminConversationAsRead(conversationId: string) {
    const conversation = await this.convRepo.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    await this.msgRepo
      .createQueryBuilder()
      .update(ChatMessage)
      .set({ read_at: new Date() })
      .where('conversation_id = :convId AND sender_type = :senderType AND read_at IS NULL', {
        convId: conversationId,
        senderType: SenderType.CUSTOMER,
      })
      .execute();

    return { success: true };
  }

  /**
   * Close conversation as Admin
   */
  async closeAdminConversation(conversationId: string) {
    const conversation = await this.convRepo.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    conversation.status = ConversationStatus.CLOSED;
    return this.convRepo.save(conversation);
  }

  /**
   * Reopen conversation as Admin
   */
  async reopenAdminConversation(conversationId: string) {
    const conversation = await this.convRepo.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    conversation.status = ConversationStatus.OPEN;
    return this.convRepo.save(conversation);
  }

  /**
   * Delete a single conversation and all its messages
   */
  async deleteConversation(conversationId: string, adminId: string) {
    const conversation = await this.convRepo.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    await this.convRepo.delete(conversationId);

    return {
      success: true,
      message: `Conversation ${conversationId} deleted successfully`,
    };
  }

  /**
   * Bulk delete chat conversations and messages
   */
  async bulkDeleteConversations(ids: string[], adminId: string): Promise<BulkDeleteResult> {
    const succeededIds: string[] = [];
    const failedItems: FailedItem[] = [];

    await this.convRepo.manager.transaction(async (manager) => {
      const existing = await manager.find(ChatConversation, {
        where: { id: In(ids) },
      });

      const foundMap = new Map(existing.map((c) => [c.id, c]));

      for (const id of ids) {
        const conv = foundMap.get(id);
        if (!conv) {
          failedItems.push({ id, reason: `Conversation with ID ${id} not found` });
          continue;
        }

        try {
          await manager.delete(ChatConversation, { id });
          succeededIds.push(id);
        } catch (err) {
          failedItems.push({
            id,
            reason: err instanceof Error ? err.message : 'Database error during chat conversation deletion',
          });
        }
      }
    });

    return {
      totalRequested: ids.length,
      succeededCount: succeededIds.length,
      failedCount: failedItems.length,
      succeededIds,
      failedItems,
      action: 'BULK_DELETE_CHAT_CONVERSATIONS',
    };
  }
}
