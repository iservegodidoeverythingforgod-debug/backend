import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrdersService } from './orders.service';
import { Order } from '../database/entities/order.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { Payment } from '../database/entities/payment.entity';
import { Product } from '../database/entities/product.entity';
import { Review } from '../database/entities/review.entity';
import { StoreSetting } from '../database/entities/store-setting.entity';
import { OrderStatus, PaymentStatus } from '../common/enums';

describe('OrdersService - Stock Deduction & Delivered Immutability', () => {
  let service: OrdersService;
  let mockProduct: any;
  let mockOrder: any;

  const mockProductRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockOrderRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockOrderItemRepository = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockPaymentRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockReviewRepository = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockStoreSettingRepository = {
    find: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue(null),
  };

  const mockQueryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue({ reserved_qty: '0' }),
    getRawMany: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOrderItemRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

    mockProduct = {
      id: 'prod-1',
      name: 'Basil Seeds',
      price: 100,
      stock: 50,
    };

    mockOrder = {
      id: 'ord-1',
      order_number: 'ORD-123456-7890',
      user_id: 'user-1',
      total_amount: 200,
      status: OrderStatus.PENDING_PAYMENT,
      items: [
        {
          id: 'item-1',
          product_id: 'prod-1',
          product_name: 'Basil Seeds',
          quantity: 2,
          unit_price: 100,
          subtotal: 200,
        },
      ],
      payment: {
        id: 'pay-1',
        status: PaymentStatus.PENDING_SUBMISSION,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: mockOrderRepository },
        { provide: getRepositoryToken(OrderItem), useValue: mockOrderItemRepository },
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepository },
        { provide: getRepositoryToken(Product), useValue: mockProductRepository },
        { provide: getRepositoryToken(Review), useValue: mockReviewRepository },
        { provide: getRepositoryToken(StoreSetting), useValue: mockStoreSettingRepository },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('1. should NOT deduct product stock upon order creation', async () => {
    mockProductRepository.findOne.mockResolvedValue({ ...mockProduct });
    mockOrderRepository.create.mockReturnValue({ ...mockOrder });
    mockOrderRepository.save.mockResolvedValue({ ...mockOrder });
    mockOrderItemRepository.create.mockReturnValue(mockOrder.items[0]);
    mockOrderItemRepository.save.mockResolvedValue(mockOrder.items[0]);
    mockReviewRepository.find.mockResolvedValue([]);
    mockOrderRepository.findOne.mockResolvedValue({ ...mockOrder });

    await service.create('user-1', {
      items: [{ productId: 'prod-1', quantity: 2 }],
      shipping_name: 'Test Buyer',
      shipping_address: 'Bangkok',
      shipping_phone: '0812345678',
    });

    // Verify productRepository.save was NOT called on order create
    expect(mockProductRepository.save).not.toHaveBeenCalled();
  });

  it('2. should block order creation if requested quantity exceeds available stock (Physical - Reserved)', async () => {
    // Physical stock is 3, but 2 are already reserved in active orders (e.g. SHIPPED)
    mockProductRepository.findOne.mockResolvedValue({ ...mockProduct, stock: 3 });
    mockQueryBuilder.getRawOne.mockResolvedValue({ reserved_qty: '2' });

    // Buyer tries to order 2, but available is 3 - 2 = 1
    await expect(
      service.create('user-1', {
        items: [{ productId: 'prod-1', quantity: 2 }],
        shipping_name: 'Test Buyer',
        shipping_address: 'Bangkok',
        shipping_phone: '0812345678',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('3. should NOT deduct product stock when status is updated to PAID_CONFIRMED or SHIPPED', async () => {
    mockOrderRepository.findOne.mockResolvedValue({ ...mockOrder, status: OrderStatus.PENDING_PAYMENT });
    mockOrderRepository.save.mockImplementation((ord) => Promise.resolve(ord));
    mockReviewRepository.find.mockResolvedValue([]);

    await service.updateStatus('ord-1', { status: OrderStatus.PAID_CONFIRMED });
    expect(mockProductRepository.save).not.toHaveBeenCalled();

    await service.updateStatus('ord-1', { status: OrderStatus.SHIPPED });
    expect(mockProductRepository.save).not.toHaveBeenCalled();
  });

  it('4. should DEDUCT product stock when status is updated to DELIVERED', async () => {
    const freshProduct = { ...mockProduct, stock: 50 };
    mockOrderRepository.findOne.mockResolvedValue({
      ...mockOrder,
      status: OrderStatus.SHIPPED,
      items: [
        {
          id: 'item-1',
          product_id: 'prod-1',
          product_name: 'Basil Seeds',
          quantity: 2,
          unit_price: 100,
          subtotal: 200,
        },
      ],
    });
    mockOrderRepository.save.mockImplementation((ord) => Promise.resolve(ord));
    mockProductRepository.findOne.mockResolvedValue(freshProduct);
    mockReviewRepository.find.mockResolvedValue([]);

    await service.updateStatus('ord-1', { status: OrderStatus.DELIVERED });

    expect(mockProductRepository.findOne).toHaveBeenCalledWith({ where: { id: 'prod-1' } });
    expect(mockProductRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'prod-1',
        stock: 48, // 50 - 2
      }),
    );
  });

  it('5. should reject status update when order is already DELIVERED', async () => {
    mockOrderRepository.findOne.mockResolvedValue({
      ...mockOrder,
      status: OrderStatus.DELIVERED,
    });
    mockReviewRepository.find.mockResolvedValue([]);

    await expect(
      service.updateStatus('ord-1', { status: OrderStatus.CANCELLED }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.updateStatus('ord-1', { status: OrderStatus.PENDING_PAYMENT }),
    ).rejects.toThrow(BadRequestException);
  });
});
