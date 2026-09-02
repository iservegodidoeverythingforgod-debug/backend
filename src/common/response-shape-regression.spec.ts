import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductsService } from '../products/products.service';
import { ChatService } from '../chat/chat.service';
import { ReportsService } from '../reports/reports.service';
import { Product } from '../database/entities/product.entity';
import { ChatConversation, ConversationStatus } from '../database/entities/chat-conversation.entity';
import { ChatMessage, SenderType } from '../database/entities/chat-message.entity';
import { User } from '../database/entities/user.entity';
import { Order } from '../database/entities/order.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { Review } from '../database/entities/review.entity';
import { StorageCleanupService } from './storage/storage-cleanup.service';

describe('Phase 2 Runtime Optimizations - Response Shape Regression Suite', () => {
  let productsService: ProductsService;
  let chatService: ChatService;
  let reportsService: ReportsService;

  let mockProductRepo: any;
  let mockConvRepo: any;
  let mockMsgRepo: any;
  let mockReviewRepo: any;
  let mockOrderRepo: any;
  let mockOrderItemRepo: any;
  let mockUserRepo: any;

  beforeEach(async () => {
    // 1. Mock Product Repository
    const sampleProduct = {
      id: 'prod-uuid-1',
      name: 'Holy Basil Seeds',
      scientific_name: 'Ocimum tenuiflorum',
      description: 'Organic holy basil seeds',
      detailed_description: 'Fast-growing holy basil',
      price: 45.0,
      stock: 120,
      image_url: 'https://test.supabase.co/storage/v1/object/public/products/basil.jpg',
      images: ['https://test.supabase.co/storage/v1/object/public/imgshot/basil_1.jpg'],
      difficulty: 'Easy',
      germination_days: 7,
      harvest_days: 45,
      is_active: true,
      category: { id: 'cat-1', name: 'Herbs' },
      growth_rule: { id: 'rule-1', name: 'Standard Basil Rule' },
    };

    const productQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([sampleProduct]),
      getManyAndCount: jest.fn().mockResolvedValue([[sampleProduct], 1]),
    };

    mockProductRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(productQueryBuilder),
      findOne: jest.fn().mockResolvedValue(sampleProduct),
    };

    // 2. Mock Chat Repositories
    const sampleConversation = {
      id: 'conv-uuid-1',
      customer_id: 'user-uuid-1',
      customer: {
        id: 'user-uuid-1',
        full_name: 'Somchai Jaidee',
        email: 'somchai@test.com',
        avatar_url: 'https://test.supabase.co/avatars/somchai.png',
      },
      status: ConversationStatus.OPEN,
      subject: 'Inquiry regarding seed germination',
      last_message_at: new Date('2026-08-29T10:00:00Z'),
      created_at: new Date('2026-08-29T09:00:00Z'),
      updated_at: new Date('2026-08-29T10:00:00Z'),
    };

    const convQueryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([sampleConversation]),
    };

    mockConvRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(convQueryBuilder),
      find: jest.fn().mockResolvedValue([sampleConversation]),
      findOne: jest.fn().mockResolvedValue(sampleConversation),
    };

    const sampleMessage = {
      id: 'msg-uuid-1',
      conversation_id: 'conv-uuid-1',
      sender_type: SenderType.CUSTOMER,
      sender_id: 'user-uuid-1',
      message: 'Hello, what is the best watering schedule for holy basil?',
      read_at: null,
      created_at: new Date('2026-08-29T10:00:00Z'),
    };

    const msgQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ convId: 'conv-uuid-1', count: '2' }]),
      getMany: jest.fn().mockResolvedValue([sampleMessage]),
    };

    mockMsgRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(msgQueryBuilder),
    };

    // 3. Mock Reports Repositories
    const reviewStatsQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ total: '10', avg: '4.7' }),
      getRawMany: jest.fn().mockResolvedValue([
        { rating: '5', count: '7' },
        { rating: '4', count: '3' },
      ]),
    };

    mockReviewRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(reviewStatsQueryBuilder),
      find: jest.fn(),
    };

    mockOrderRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ sum: '15000.00' }),
      }),
      count: jest.fn().mockResolvedValue(42),
    };

    mockOrderItemRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        addGroupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
    };

    mockUserRepo = {
      count: jest.fn().mockResolvedValue(25),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        ChatService,
        ReportsService,
        { provide: getRepositoryToken(Product), useValue: mockProductRepo },
        { provide: getRepositoryToken(ChatConversation), useValue: mockConvRepo },
        { provide: getRepositoryToken(ChatMessage), useValue: mockMsgRepo },
        { provide: getRepositoryToken(Review), useValue: mockReviewRepo },
        { provide: getRepositoryToken(Order), useValue: mockOrderRepo },
        { provide: getRepositoryToken(OrderItem), useValue: mockOrderItemRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        {
          provide: StorageCleanupService,
          useValue: { deleteFileByUrl: jest.fn(), deleteFilesByUrls: jest.fn() },
        },
      ],
    }).compile();

    productsService = module.get<ProductsService>(ProductsService);
    chatService = module.get<ChatService>(ChatService);
    reportsService = module.get<ReportsService>(ReportsService);
  });

  describe('GET /api/products response shape regression', () => {
    it('should return products with core catalog fields matching Flutter Product.fromJson', async () => {
      const result = (await productsService.findAll()) as Product[];
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);

      const product = result[0];
      expect(product).toHaveProperty('id', 'prod-uuid-1');
      expect(product).toHaveProperty('name', 'Holy Basil Seeds');
      expect(product).toHaveProperty('scientific_name', 'Ocimum tenuiflorum');
      expect(product).toHaveProperty('price', 45.0);
      expect(product).toHaveProperty('stock', 120);
      expect(product).toHaveProperty('difficulty', 'Easy');
      expect(product).toHaveProperty('germination_days', 7);
      expect(product).toHaveProperty('harvest_days', 45);
      expect(product).toHaveProperty('category');
      expect(product.category).toHaveProperty('name', 'Herbs');
      expect(product).toHaveProperty('growth_rule');
      expect(product.growth_rule).toHaveProperty('name', 'Standard Basil Rule');
    });

    it('should return paginated products structure when page/limit requested', async () => {
      const result: any = await productsService.findAll({ page: 1, limit: 12 });
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total', 1);
      expect(result).toHaveProperty('page', 1);
      expect(result).toHaveProperty('limit', 12);
      expect(result).toHaveProperty('totalPages', 1);
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('GET /api/admin/chat/conversations response shape regression', () => {
    it('should return conversation headers with unread_count and last_message matching Flutter ChatConversation.fromJson', async () => {
      const conversations = await chatService.getAdminConversations();
      expect(Array.isArray(conversations)).toBe(true);
      expect(conversations.length).toBe(1);

      const conv = conversations[0];
      expect(conv).toHaveProperty('id', 'conv-uuid-1');
      expect(conv).toHaveProperty('customer_id', 'user-uuid-1');
      expect(conv).toHaveProperty('customer_name', 'Somchai Jaidee');
      expect(conv).toHaveProperty('customer_email', 'somchai@test.com');
      expect(conv).toHaveProperty('customer_avatar', 'https://test.supabase.co/avatars/somchai.png');
      expect(conv).toHaveProperty('status', ConversationStatus.OPEN);
      expect(conv).toHaveProperty('subject', 'Inquiry regarding seed germination');
      expect(conv).toHaveProperty('unread_count', 2);
      expect(conv).toHaveProperty('last_message');
      expect(conv.last_message).toHaveProperty('message', 'Hello, what is the best watering schedule for holy basil?');
      expect(conv).toHaveProperty('messages');
      expect(Array.isArray(conv.messages)).toBe(true);
    });
  });

  describe('GET /api/reports/satisfaction response shape regression', () => {
    it('should return all snake_case and camelCase fields matching Flutter CustomerSatisfactionReport.fromJson', async () => {
      const report = await reportsService.getCustomerSatisfaction();

      // CamelCase fields
      expect(report).toHaveProperty('totalReviews', 10);
      expect(report).toHaveProperty('averageRating', 4.7);
      expect(report).toHaveProperty('ratingDistribution');
      expect(report.ratingDistribution).toEqual({ 5: 7, 4: 3, 3: 0, 2: 0, 1: 0 });
      expect(report).toHaveProperty('satisfactionPercentage', 100);

      // Snake_case aliases for API resilience
      expect(report).toHaveProperty('total_reviews', 10);
      expect(report).toHaveProperty('average_rating', 4.7);
      expect(report).toHaveProperty('rating_distribution');
      expect(report).toHaveProperty('satisfaction_percentage', 100);
    });
  });
});
