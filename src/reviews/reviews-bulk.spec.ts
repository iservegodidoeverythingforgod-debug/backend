import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReviewsService } from './reviews.service';
import { Review } from '../database/entities/review.entity';
import { Product } from '../database/entities/product.entity';
import { Order } from '../database/entities/order.entity';

describe('ReviewsService - Bulk Delete', () => {
  let service: ReviewsService;
  let mockReviewRepo: any;
  let mockProductRepo: any;
  let mockOrderRepo: any;
  let mockEntityManager: any;

  beforeEach(async () => {
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
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  describe('bulkRemove', () => {
    it('should bulk delete reviews', async () => {
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
    });
  });

  describe('create - per-product review within order', () => {
    it('should allow reviewing two distinct products in the same order separately', async () => {
      const orderId = 'a0000000-0000-0000-0000-000000000001';
      const prodAId = 'p0000000-0000-0000-0000-000000000001';
      const prodBId = 'p0000000-0000-0000-0000-000000000002';
      const userId = 'u0000000-0000-0000-0000-000000000001';

      mockOrderRepo.findOne = jest.fn().mockResolvedValue({
        id: orderId,
        user_id: userId,
        items: [
          { product_id: prodAId, product_name: 'Marijuana Sachet' },
          { product_id: prodBId, product_name: 'Hemp Sachet' },
        ],
      });

      mockProductRepo.findOne = jest.fn().mockImplementation(({ where: { id } }) => {
        if (id === prodAId) return Promise.resolve({ id: prodAId, name: 'Marijuana Sachet' });
        if (id === prodBId) return Promise.resolve({ id: prodBId, name: 'Hemp Sachet' });
        return Promise.resolve(null);
      });

      // Product A is not reviewed yet
      mockReviewRepo.findOne = jest.fn().mockResolvedValue(null);
      mockReviewRepo.create = jest.fn().mockImplementation((r) => r);
      mockReviewRepo.save = jest.fn().mockImplementation((r) => Promise.resolve({ id: 'rev-1', ...r }));

      const reviewA = await service.create(userId, {
        orderId,
        productId: prodAId,
        rating: 5,
        comment: 'Marijuana quality was fantastic!',
      });

      expect(reviewA.order_id).toBe(orderId);
      expect(reviewA.product_id).toBe(prodAId);
      expect(reviewA.rating).toBe(5);

      // Now review Product B in the same order
      const reviewB = await service.create(userId, {
        orderId,
        productId: prodBId,
        rating: 4,
        comment: 'Hemp was great too.',
      });

      expect(reviewB.order_id).toBe(orderId);
      expect(reviewB.product_id).toBe(prodBId);
      expect(reviewB.rating).toBe(4);
    });

    it('should reject duplicate review for the same product in the same order', async () => {
      const orderId = 'a0000000-0000-0000-0000-000000000001';
      const prodAId = 'p0000000-0000-0000-0000-000000000001';
      const userId = 'u0000000-0000-0000-0000-000000000001';

      mockOrderRepo.findOne = jest.fn().mockResolvedValue({
        id: orderId,
        user_id: userId,
        items: [{ product_id: prodAId, product_name: 'Marijuana Sachet' }],
      });

      mockProductRepo.findOne = jest.fn().mockResolvedValue({ id: prodAId, name: 'Marijuana Sachet' });
      // Already reviewed Product A in this order
      mockReviewRepo.findOne = jest.fn().mockResolvedValue({
        id: 'rev-1',
        order_id: orderId,
        product_id: prodAId,
        user_id: userId,
      });

      await expect(
        service.create(userId, {
          orderId,
          productId: prodAId,
          rating: 5,
          comment: 'Duplicate review attempt',
        }),
      ).rejects.toThrow('You have already submitted a review for this product in this order.');
    });
  });
});

