import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { Order } from '../database/entities/order.entity';
import { Review } from '../database/entities/review.entity';
import { ChatConversation } from '../database/entities/chat-conversation.entity';
import { ChatMessage } from '../database/entities/chat-message.entity';
import { Payment } from '../database/entities/payment.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { Role } from '../common/enums';
import { DELETED_USER_ID, DELETED_USER_EMAIL, DELETED_USER_NAME } from '../common/constants';
import { StorageCleanupService } from '../common/storage/storage-cleanup.service';
import { AuditLogService } from '../common/audit/audit-log.service';
import { BulkDeleteResult, FailedItem } from '../common/dto/bulk-delete.dto';
import { AuditStatus } from '../database/entities/audit-log.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Review)
    private reviewRepository: Repository<Review>,
    @InjectRepository(ChatConversation)
    private chatConversationRepository: Repository<ChatConversation>,
    @InjectRepository(ChatMessage)
    private chatMessageRepository: Repository<ChatMessage>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    private readonly storageCleanupService: StorageCleanupService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async findAll(role?: Role, search?: string) {
    const qb = this.userRepository.createQueryBuilder('user');

    // Exclude system sentinel accounts from normal admin user listings
    qb.where('user.role != :systemRole', { systemRole: Role.SYSTEM });

    if (role) {
      qb.andWhere('user.role = :role', { role });
    }

    if (search) {
      qb.andWhere(
        '(LOWER(user.full_name) LIKE :search OR LOWER(user.email) LIKE :search)',
        { search: `%${search.toLowerCase()}%` },
      );
    }

    qb.orderBy('user.created_at', 'DESC');
    return qb.getMany();
  }

  async findOne(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['orders'],
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async updateStatus(id: string, is_active: boolean) {
    const user = await this.findOne(id);
    if (user.id === DELETED_USER_ID || user.role === Role.SYSTEM) {
      throw new BadRequestException('Cannot modify status of system account');
    }
    user.is_active = is_active;
    return this.userRepository.save(user);
  }

  async updateRole(id: string, role: Role) {
    const user = await this.findOne(id);
    if (user.id === DELETED_USER_ID || user.role === Role.SYSTEM) {
      throw new BadRequestException('Cannot modify role of system account');
    }
    user.role = role;
    return this.userRepository.save(user);
  }

  /**
   * Deletes a user while preserving 100% of historical activity (orders, reviews,
   * payments, chat conversations, and messages) by reassigning them to the Sentinel Deleted User account.
   * Also cleans up the user's avatar in Supabase Storage.
   */
  async deleteUserPreservingHistory(userId: string, actingAdminId?: string) {
    if (userId === DELETED_USER_ID) {
      throw new BadRequestException('Cannot delete the sentinel deleted-user account');
    }

    if (actingAdminId && userId === actingAdminId) {
      throw new BadRequestException('Cannot delete your own administrator account');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (user.role === Role.SYSTEM) {
      throw new BadRequestException('Cannot delete a system account');
    }

    if (user.role === Role.ADMIN) {
      const activeAdminCount = await this.userRepository.count({
        where: { role: Role.ADMIN, is_active: true, id: Not(DELETED_USER_ID) },
      });
      if (activeAdminCount <= 1) {
        throw new BadRequestException('Cannot delete the last remaining active administrator');
      }
    }

    const avatarUrl = user.avatar_url;

    // Ensure the sentinel deleted user account exists before reassigning
    let sentinel = await this.userRepository.findOne({ where: { id: DELETED_USER_ID } });
    if (!sentinel) {
      sentinel = this.userRepository.create({
        id: DELETED_USER_ID,
        email: DELETED_USER_EMAIL,
        password_hash: 'unusable-no-login',
        full_name: DELETED_USER_NAME,
        role: Role.SYSTEM,
        is_active: false,
        is_verified: true,
        verified_at: new Date(),
      });
      await this.userRepository.save(sentinel);
    }

    const result = await this.userRepository.manager.transaction(async (manager) => {
      // 1. Repoint orders
      await manager
        .createQueryBuilder()
        .update(Order)
        .set({ user_id: DELETED_USER_ID })
        .where('user_id = :userId', { userId })
        .execute();

      // 2. Repoint reviews
      await manager
        .createQueryBuilder()
        .update(Review)
        .set({ user_id: DELETED_USER_ID })
        .where('user_id = :userId', { userId })
        .execute();

      // 3. Repoint chat conversations
      await manager
        .createQueryBuilder()
        .update(ChatConversation)
        .set({ customer_id: DELETED_USER_ID })
        .where('customer_id = :userId', { userId })
        .execute();

      // 4. Repoint chat messages
      await manager
        .createQueryBuilder()
        .update(ChatMessage)
        .set({ sender_id: DELETED_USER_ID })
        .where('sender_id = :userId', { userId })
        .execute();

      // 5. Repoint payments verified_by (if this user was an admin verifier)
      await manager
        .createQueryBuilder()
        .update(Payment)
        .set({ verified_by: DELETED_USER_ID })
        .where('verified_by = :userId', { userId })
        .execute();

      // 6. Delete login refresh tokens (pure ephemeral session data)
      await manager
        .createQueryBuilder()
        .delete()
        .from(RefreshToken)
        .where('user_id = :userId', { userId })
        .execute();

      // 7. Delete the user row
      await manager.delete(User, { id: userId });

      return {
        success: true,
        message: `User ${user.email} (${user.id}) deleted. All historical records preserved under sentinel account.`,
      };
    });

    // Non-blocking avatar storage cleanup
    if (avatarUrl) {
      this.storageCleanupService.deleteFileByUrl(avatarUrl).catch(() => null);
    }

    return result;
  }

  async remove(id: string, actingAdminId?: string) {
    return this.deleteUserPreservingHistory(id, actingAdminId);
  }

  /**
   * Bulk deletion of users with safety guards against self-deletion,
   * sentinel deletion, and last-admin lockout.
   */
  async bulkRemove(ids: string[], actingAdminId: string): Promise<BulkDeleteResult> {
    const succeededIds: string[] = [];
    const failedItems: FailedItem[] = [];
    const avatarsToClean: string[] = [];

    // Check active admins count
    const totalActiveAdmins = await this.userRepository.count({
      where: { role: Role.ADMIN, is_active: true, id: Not(DELETED_USER_ID) },
    });

    // Ensure sentinel exists
    let sentinel = await this.userRepository.findOne({ where: { id: DELETED_USER_ID } });
    if (!sentinel) {
      sentinel = this.userRepository.create({
        id: DELETED_USER_ID,
        email: DELETED_USER_EMAIL,
        password_hash: 'unusable-no-login',
        full_name: DELETED_USER_NAME,
        role: Role.SYSTEM,
        is_active: false,
        is_verified: true,
        verified_at: new Date(),
      });
      await this.userRepository.save(sentinel);
    }

    const usersToDelete: User[] = [];
    let adminDeleteCount = 0;

    const existingUsers = await this.userRepository.find({
      where: { id: In(ids) },
    });
    const foundMap = new Map(existingUsers.map((u) => [u.id, u]));

    for (const id of ids) {
      if (id === DELETED_USER_ID) {
        failedItems.push({ id, reason: 'Cannot delete the sentinel deleted-user account' });
        continue;
      }

      if (id === actingAdminId) {
        failedItems.push({ id, reason: 'Cannot self-delete acting administrator account' });
        continue;
      }

      const user = foundMap.get(id);
      if (!user) {
        failedItems.push({ id, reason: `User with ID ${id} not found` });
        continue;
      }

      if (user.role === Role.SYSTEM) {
        failedItems.push({ id, reason: 'Cannot delete a system account' });
        continue;
      }

      if (user.role === Role.ADMIN) {
        if (totalActiveAdmins - (adminDeleteCount + 1) < 1) {
          failedItems.push({
            id,
            reason: 'Cannot delete user: at least one active administrator must remain in the system',
          });
          continue;
        }
        adminDeleteCount++;
      }

      usersToDelete.push(user);
    }

    if (usersToDelete.length > 0) {
      const validIds = usersToDelete.map((u) => u.id);

      await this.userRepository.manager.transaction(async (manager) => {
        // 1. Repoint orders
        await manager
          .createQueryBuilder()
          .update(Order)
          .set({ user_id: DELETED_USER_ID })
          .where('user_id IN (:...validIds)', { validIds })
          .execute();

        // 2. Repoint reviews
        await manager
          .createQueryBuilder()
          .update(Review)
          .set({ user_id: DELETED_USER_ID })
          .where('user_id IN (:...validIds)', { validIds })
          .execute();

        // 3. Repoint chat conversations
        await manager
          .createQueryBuilder()
          .update(ChatConversation)
          .set({ customer_id: DELETED_USER_ID })
          .where('customer_id IN (:...validIds)', { validIds })
          .execute();

        // 4. Repoint chat messages
        await manager
          .createQueryBuilder()
          .update(ChatMessage)
          .set({ sender_id: DELETED_USER_ID })
          .where('sender_id IN (:...validIds)', { validIds })
          .execute();

        // 5. Repoint payments verified_by
        await manager
          .createQueryBuilder()
          .update(Payment)
          .set({ verified_by: DELETED_USER_ID })
          .where('verified_by IN (:...validIds)', { validIds })
          .execute();

        // 6. Delete refresh tokens
        await manager
          .createQueryBuilder()
          .delete()
          .from(RefreshToken)
          .where('user_id IN (:...validIds)', { validIds })
          .execute();

        // 7. Delete user records
        await manager
          .createQueryBuilder()
          .delete()
          .from(User)
          .where('id IN (:...validIds)', { validIds })
          .execute();

        for (const user of usersToDelete) {
          succeededIds.push(user.id);
          if (user.avatar_url) {
            avatarsToClean.push(user.avatar_url);
          }
        }
      });
    }

    // Non-blocking avatar storage cleanup
    if (avatarsToClean.length > 0) {
      this.storageCleanupService.deleteFilesByUrls(avatarsToClean).catch((err) => {
        this.logger.warn(`Storage cleanup failed for bulk deleted user avatars: ${err}`);
      });
    }

    const auditStatus =
      failedItems.length === 0
        ? AuditStatus.SUCCESS
        : succeededIds.length > 0
        ? AuditStatus.PARTIAL
        : AuditStatus.FAILED;

    await this.auditLogService.logAction({
      adminId: actingAdminId,
      action: 'BULK_DELETE_USERS',
      targetType: 'users',
      targetIds: succeededIds,
      details: {
        totalRequested: ids.length,
        succeededCount: succeededIds.length,
        failedCount: failedItems.length,
        failedItems,
      },
      status: auditStatus,
    });

    return {
      totalRequested: ids.length,
      succeededCount: succeededIds.length,
      failedCount: failedItems.length,
      succeededIds,
      failedItems,
      action: 'BULK_DELETE_USERS',
    };
  }
}
