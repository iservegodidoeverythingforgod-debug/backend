import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { StorageCleanupService, OrphanScanReport } from './storage-cleanup.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../enums';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AuditLogService } from '../audit/audit-log.service';

@ApiTags('Admin Storage Management')
@Controller('admin/storage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class StorageController {
  constructor(
    private readonly storageCleanupService: StorageCleanupService,
    private readonly auditLogService: AuditLogService,
  ) {}

  @Get('orphans')
  @ApiOperation({ summary: 'Scan storage buckets for unreferenced/orphaned files (Admin only)' })
  async scanOrphans(@Query('buckets') buckets?: string): Promise<OrphanScanReport> {
    const bucketList = buckets ? buckets.split(',').map((b) => b.trim()) : undefined;
    return this.storageCleanupService.scanOrphanedFiles(bucketList);
  }

  @Post('clean-orphans')
  @ApiOperation({ summary: 'Clean specific verified orphaned files (Admin only)' })
  async cleanOrphans(
    @CurrentUser('id') adminId: string,
    @Body('items') items: { bucket: string; key: string }[],
  ) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return { deleted: [], failed: [], message: 'No items provided for cleanup' };
    }

    const result = await this.storageCleanupService.cleanConfirmedOrphans(items);

    await this.auditLogService.logAction({
      adminId,
      action: 'CLEAN_ORPHANED_STORAGE_FILES',
      targetType: 'storage_objects',
      targetIds: items.map((i) => `${i.bucket}/${i.key}`),
      details: { deletedCount: result.deleted.length, failedCount: result.failed.length },
    });

    return {
      success: true,
      deletedCount: result.deleted.length,
      failedCount: result.failed.length,
      deleted: result.deleted,
      failed: result.failed,
    };
  }
}
