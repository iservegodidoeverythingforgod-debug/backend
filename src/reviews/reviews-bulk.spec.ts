import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReviewsService } from './reviews.service';
import { Review } from '../database/entities/review.entity';
import { Product } from '../database/entities/product.entity';
import { Order } from '../database/entities/order.entity';
import { AuditLogService } from '../common/audit/audit-log.service';
import { AuditStatus } from '../database/entities/audit-log.entity';

describe('ReviewsService - Bulk Delete', () => {
  let service: ReviewsService;
  let mockReviewRepo: any;
  let mockProductRepo: any;
  let mockOrderRepo: any;
  let mockAuditLogService: Partial<AuditLogService>;
  let mockEntityManager: any;

  beforeEach(async () => {
    mockAuditLogService = {
      logAction: jest.fn().mockResolvedValue({} as any),
    };

    mockEntityManager = {
      find: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockReviewRepo = {
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      manager: {
        transaction: jest.fn().mockImplementation(async (callback) => {
          return callback(mockEntityManager);
        }),
      },
    };

    mockOrderRepo = {};
    mockProductRepo = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        {
          provide: getRepositoryToken(Review),
          useValue: mockReviewRepo,
        },
        {
          provide: getRepositoryToken(Product),
          useValue: mockProductRepo,
        },
        {
          provide: getRepositoryToken(Order),
          useValue: mockOrderRepo,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  describe('bulkRemove', () => {
    it('should bulk delete reviews and record audit log', async () => {
      const ids = ['rev-1', 'rev-2'];
      mockEntityManager.find.mockResolvedValueOnce([
        { id: 'rev-1', rating: 5, comment: 'Great basil' },
        { id: 'rev-2', rating: 4, comment: 'Good germination' },
      ]);

      const result = await service.bulkRemove(ids, 'admin-1');

      expect(result.totalRequested).toBe(2);
      expect(result.succeededCount).toBe(2);
      expect(result.failedCount).toBe(0);
      expect(mockEntityManager.delete).toHaveBeenCalledTimes(2);

      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'admin-1',
          action: 'BULK_DELETE_REVIEWS',
          targetType: 'reviews',
          targetIds: ['rev-1', 'rev-2'],
          status: AuditStatus.SUCCESS,
        }),
      );
    });
  });
});
