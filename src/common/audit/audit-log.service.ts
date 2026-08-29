import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditStatus } from '../../database/entities/audit-log.entity';

export interface LogActionParams {
  adminId: string;
  action: string;
  targetType: string;
  targetIds: string[];
  details?: Record<string, any>;
  status?: AuditStatus;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async logAction(params: LogActionParams): Promise<AuditLog> {
    try {
      const entry = this.auditLogRepository.create({
        admin_id: params.adminId,
        action: params.action,
        target_type: params.targetType,
        target_ids: params.targetIds || [],
        details: params.details || {},
        status: params.status || AuditStatus.SUCCESS,
      });

      const saved = await this.auditLogRepository.save(entry);
      this.logger.log(
        `[AUDIT] Admin ${params.adminId} executed ${params.action} on ${params.targetType} (${params.targetIds.length} items) - Status: ${params.status || AuditStatus.SUCCESS}`,
      );
      return saved;
    } catch (error) {
      this.logger.error(
        `Failed to record audit log for action ${params.action}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      // Non-blocking: do not crash primary execution flow if audit write fails
      return null as any;
    }
  }

  async getRecentLogs(limit = 50) {
    return this.auditLogRepository.find({
      order: { created_at: 'DESC' },
      take: Math.min(limit, 100),
    });
  }
}
