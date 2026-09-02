import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChatService } from './chat.service';
import { ChatConversation } from '../database/entities/chat-conversation.entity';
import { ChatMessage } from '../database/entities/chat-message.entity';
import { User } from '../database/entities/user.entity';

describe('ChatService - Bulk & Single Deletion', () => {
  let service: ChatService;
  let mockConvRepo: any;
  let mockMsgRepo: any;
  let mockUserRepo: any;
  let mockEntityManager: any;
  let mockQueryBuilder: any;

  beforeEach(async () => {
    mockQueryBuilder = {
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 3 }),
    };

    mockEntityManager = {
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockConvRepo = {
      findOne: jest.fn(),
      manager: {
        transaction: jest.fn().mockImplementation(async (callback) => {
          return callback(mockEntityManager);
        }),
      },
    };

    mockMsgRepo = {};
    mockUserRepo = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: getRepositoryToken(ChatConversation),
          useValue: mockConvRepo,
        },
        {
          provide: getRepositoryToken(ChatMessage),
          useValue: mockMsgRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  describe('bulkDeleteConversations', () => {
    it('should delete conversations and messages', async () => {
      const ids = ['conv-1', 'conv-2'];
      mockEntityManager.find.mockResolvedValueOnce([
        { id: 'conv-1', subject: 'Inquiry 1' },
        { id: 'conv-2', subject: 'Inquiry 2' },
      ]);

      const result = await service.bulkDeleteConversations(ids, 'admin-1');

      expect(result.totalRequested).toBe(2);
      expect(result.succeededCount).toBe(2);
      expect(mockEntityManager.delete).toHaveBeenCalledTimes(2);
    });
  });
});

