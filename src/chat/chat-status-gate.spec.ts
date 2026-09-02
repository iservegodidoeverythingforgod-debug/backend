import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChatService } from './chat.service';
import {
  ChatConversation,
  ConversationStatus,
} from '../database/entities/chat-conversation.entity';
import {
  ChatMessage,
  SenderType,
} from '../database/entities/chat-message.entity';
import { User } from '../database/entities/user.entity';

describe('ChatService - Conversation Status Gate (CLOSED vs OPEN)', () => {
  let service: ChatService;
  let mockConvRepo: any;
  let mockMsgRepo: any;

  beforeEach(async () => {
    mockConvRepo = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((c) => Promise.resolve(c)),
      create: jest.fn().mockImplementation((c) => c),
      manager: {
        transaction: jest.fn().mockImplementation(async (cb) => {
          const em = {
            findOne: mockConvRepo.findOne,
            save: jest.fn().mockImplementation((cls, entity) => Promise.resolve(entity || cls)),
            create: jest.fn().mockImplementation((cls, entity) => entity),
          };
          return cb(em);
        }),
      },
    };

    mockMsgRepo = {
      create: jest.fn().mockImplementation((m) => m),
      save: jest.fn().mockImplementation((m) => Promise.resolve({ id: 'msg-uuid-1', ...m })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: getRepositoryToken(ChatConversation), useValue: mockConvRepo },
        { provide: getRepositoryToken(ChatMessage), useValue: mockMsgRepo },
        { provide: getRepositoryToken(User), useValue: {} },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('sendCustomerMessage status gating', () => {
    it('should reject customer message with BadRequestException when conversation is CLOSED', async () => {
      const closedConv = {
        id: 'conv-123',
        customer_id: 'cust-1',
        status: ConversationStatus.CLOSED,
      };

      mockConvRepo.findOne.mockResolvedValue(closedConv);

      await expect(
        service.sendCustomerMessage('cust-1', 'conv-123', {
          message: 'Hello, can I still get help on this?',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockMsgRepo.save).not.toHaveBeenCalled();
    });

    it('should allow customer message when conversation is OPEN', async () => {
      const openConv = {
        id: 'conv-123',
        customer_id: 'cust-1',
        status: ConversationStatus.OPEN,
      };

      mockConvRepo.findOne.mockResolvedValue(openConv);

      const result = await service.sendCustomerMessage('cust-1', 'conv-123', {
        message: 'Valid customer message',
      });

      expect(result).toBeDefined();
      expect(mockMsgRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          conversation_id: 'conv-123',
          sender_type: SenderType.CUSTOMER,
          sender_id: 'cust-1',
          message: 'Valid customer message',
        }),
      );
    });

    it('should reject message if customer is not the conversation owner', async () => {
      const otherConv = {
        id: 'conv-123',
        customer_id: 'other-cust',
        status: ConversationStatus.OPEN,
      };

      mockConvRepo.findOne.mockResolvedValue(otherConv);

      await expect(
        service.sendCustomerMessage('cust-1', 'conv-123', {
          message: 'Sneaking into another chat',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('sendAdminMessage & reopenAdminConversation', () => {
    it('should allow admin to reply to a CLOSED conversation without throwing and keep status CLOSED', async () => {
      const closedConv = {
        id: 'conv-123',
        customer_id: 'cust-1',
        status: ConversationStatus.CLOSED,
      };

      mockConvRepo.findOne.mockResolvedValue(closedConv);

      const result = await service.sendAdminMessage('admin-1', 'conv-123', {
        message: 'Here is a closing follow-up note for your records.',
      });

      expect(result).toBeDefined();
      expect(mockMsgRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          conversation_id: 'conv-123',
          sender_type: SenderType.ADMIN,
          sender_id: 'admin-1',
          message: 'Here is a closing follow-up note for your records.',
        }),
      );
      // Status remains CLOSED
      expect(closedConv.status).toBe(ConversationStatus.CLOSED);
    });

    it('should reopen conversation when admin explicitly calls reopenAdminConversation', async () => {
      const closedConv = {
        id: 'conv-123',
        status: ConversationStatus.CLOSED,
      };

      mockConvRepo.findOne.mockResolvedValue(closedConv);

      const reopened = await service.reopenAdminConversation('conv-123');

      expect(reopened.status).toBe(ConversationStatus.OPEN);
      expect(mockConvRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'conv-123',
          status: ConversationStatus.OPEN,
        }),
      );
    });
  });

  describe('createCustomerConversation status gating', () => {
    it('should reject new conversation creation when customer already has a CLOSED conversation', async () => {
      const closedConv = {
        id: 'conv-closed-1',
        customer_id: 'cust-1',
        status: ConversationStatus.CLOSED,
      };

      // em.findOne first call (OPEN check) returns null, second call (CLOSED check) returns closedConv
      mockConvRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(closedConv);

      await expect(
        service.createCustomerConversation('cust-1', {
          message: 'Trying to start a new chat after admin closed previous one',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create new conversation if customer has no conversations (e.g. previous was deleted by admin)', async () => {
      mockConvRepo.findOne
        .mockResolvedValueOnce(null) // no OPEN
        .mockResolvedValueOnce(null); // no CLOSED

      const result = await service.createCustomerConversation('cust-1', {
        message: 'Fresh inquiry',
      });

      expect(result).toBeDefined();
      expect(result.conversation).toBeDefined();
      expect(result.message).toBeDefined();
    });

    it('should append to existing OPEN conversation if customer has an open thread', async () => {
      const openConv = {
        id: 'conv-open-1',
        customer_id: 'cust-1',
        status: ConversationStatus.OPEN,
      };

      mockConvRepo.findOne.mockResolvedValueOnce(openConv);

      const result = await service.createCustomerConversation('cust-1', {
        message: 'Follow-up in open thread',
      });

      expect(result.conversation.id).toBe('conv-open-1');
      expect(result.message.message).toBe('Follow-up in open thread');
      expect(result.message.conversation_id).toBe('conv-open-1');
    });
  });
});
