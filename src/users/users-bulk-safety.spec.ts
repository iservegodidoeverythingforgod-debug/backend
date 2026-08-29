import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { DELETED_USER_ID } from '../common/constants';
import { User } from '../database/entities/user.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { Order } from '../database/entities/order.entity';
import { Review } from '../database/entities/review.entity';
import { ChatConversation } from '../database/entities/chat-conversation.entity';
import { ChatMessage } from '../database/entities/chat-message.entity';
import { Payment } from '../database/entities/payment.entity';
import { StorageCleanupService } from '../common/storage/storage-cleanup.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { Role } from '../common/enums';
import { BadRequestException } from '@nestjs/common';

describe('UsersService - Bulk Delete Safety Guards & Storage Cleanup', () => {
  let service: UsersService;
  let mockUserRepo: any;
  let mockRefreshTokenRepo: any;
  let mockStorageCleanupService: Partial<StorageCleanupService>;
  let mockAuditLogService: Partial<AuditLogService>;
  let mockEntityManager: any;
  let mockQueryBuilder: any;

  beforeEach(async () => {
    mockStorageCleanupService = {
      deleteFileByUrl: jest.fn().mockResolvedValue(true),
      deleteFilesByUrls: jest.fn().mockResolvedValue({ deleted: 1, failed: 0 }),
    };

    mockAuditLogService = {
      logAction: jest.fn().mockResolvedValue({} as any),
    };

    mockQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockEntityManager = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    mockUserRepo = {
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(2), // 2 active admins by default
      save: jest.fn().mockImplementation((u) => Promise.resolve(u)),
      create: jest.fn().mockImplementation((u) => u),
      manager: {
        transaction: jest.fn().mockImplementation(async (callback) => {
          return callback(mockEntityManager);
        }),
      },
    };

    mockRefreshTokenRepo = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepo,
        },
        {
          provide: getRepositoryToken(Order),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Review),
          useValue: {},
        },
        {
          provide: getRepositoryToken(ChatConversation),
          useValue: {},
        },
        {
          provide: getRepositoryToken(ChatMessage),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: {},
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepo,
        },
        {
          provide: StorageCleanupService,
          useValue: mockStorageCleanupService,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('Single delete safety guards (remove)', () => {
    it('should reject deleting the sentinel system account', async () => {
      await expect(service.remove(DELETED_USER_ID, 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject self-deletion of the acting administrator', async () => {
      await expect(service.remove('admin-1', 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject deleting the last remaining active administrator', async () => {
      mockUserRepo.count.mockResolvedValueOnce(1); // Only 1 admin left
      mockUserRepo.findOne.mockResolvedValueOnce({
        id: 'admin-2',
        role: Role.ADMIN,
        is_active: true,
      });

      await expect(service.remove('admin-2', 'admin-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('bulkRemove safety guards', () => {
    it('should reject self-deletion, sentinel deletion, and last-admin deletion in bulk request', async () => {
      const actingAdminId = 'admin-acting';
      const sentinelId = DELETED_USER_ID;
      const otherAdminId = 'admin-sole';

      // 1 active admin total
      mockUserRepo.count.mockResolvedValueOnce(1);
      mockUserRepo.find.mockResolvedValueOnce([
        { id: otherAdminId, role: Role.ADMIN, is_active: true },
      ]);

      const result = await service.bulkRemove(
        [actingAdminId, sentinelId, otherAdminId],
        actingAdminId,
      );

      expect(result.totalRequested).toBe(3);
      expect(result.succeededCount).toBe(0);
      expect(result.failedCount).toBe(3);

      expect(result.failedItems).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: sentinelId, reason: expect.stringContaining('sentinel') }),
          expect.objectContaining({ id: actingAdminId, reason: expect.stringContaining('self-delete') }),
          expect.objectContaining({ id: otherAdminId, reason: expect.stringContaining('administrator must remain') }),
        ]),
      );
    });

    it('should successfully bulk delete customer users, reassign history, and clean up avatars', async () => {
      const actingAdminId = 'admin-acting';
      const user1 = {
        id: 'cust-1',
        role: Role.CUSTOMER,
        email: 'c1@test.com',
        avatar_url: 'https://test.supabase.co/storage/v1/object/public/avatars/c1.png',
      };
      const user2 = {
        id: 'cust-2',
        role: Role.CUSTOMER,
        email: 'c2@test.com',
        avatar_url: null,
      };

      mockUserRepo.count.mockResolvedValueOnce(2);
      mockUserRepo.find.mockResolvedValueOnce([user1, user2]);

      const result = await service.bulkRemove(['cust-1', 'cust-2'], actingAdminId);

      expect(result.succeededCount).toBe(2);
      expect(result.failedCount).toBe(0);

      // Verify history reassignment queries
      expect(mockEntityManager.createQueryBuilder).toHaveBeenCalled();

      // Verify avatar storage cleanup called for customer 1
      expect(mockStorageCleanupService.deleteFilesByUrls).toHaveBeenCalledWith([
        'https://test.supabase.co/storage/v1/object/public/avatars/c1.png',
      ]);

      // Verify audit log
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: actingAdminId,
          action: 'BULK_DELETE_USERS',
          targetType: 'users',
          targetIds: ['cust-1', 'cust-2'],
        }),
      );
    });
  });
});
