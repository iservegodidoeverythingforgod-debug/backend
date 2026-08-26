import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../database/entities/user.entity';
import { Order } from '../database/entities/order.entity';
import { Review } from '../database/entities/review.entity';
import { ChatConversation } from '../database/entities/chat-conversation.entity';
import { ChatMessage } from '../database/entities/chat-message.entity';
import { Payment } from '../database/entities/payment.entity';
import { RefreshToken } from '../database/entities/refresh-token.entity';
import { Role } from '../common/enums';
import { DELETED_USER_ID, DELETED_USER_EMAIL, DELETED_USER_NAME } from '../common/constants';

@Injectable()
export class UsersService {
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
   */
  async deleteUserPreservingHistory(userId: string) {
    if (userId === DELETED_USER_ID) {
      throw new BadRequestException('Cannot delete the sentinel deleted-user account');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (user.role === Role.SYSTEM) {
      throw new BadRequestException('Cannot delete a system account');
    }

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

    return this.userRepository.manager.transaction(async (manager) => {
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
  }

  async remove(id: string) {
    return this.deleteUserPreservingHistory(id);
  }
}
