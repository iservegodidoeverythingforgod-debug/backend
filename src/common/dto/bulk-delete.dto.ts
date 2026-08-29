import { IsArray, ArrayNotEmpty, ArrayMaxSize, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkDeleteDto {
  @ApiProperty({
    description: 'Array of UUIDs to delete in batch (maximum 100 per request)',
    example: [
      'b0000000-0000-0000-0000-000000000001',
      'b0000000-0000-0000-0000-000000000002',
    ],
    type: [String],
  })
  @IsArray({ message: 'ids must be provided as an array' })
  @ArrayNotEmpty({ message: 'ids array cannot be empty' })
  @ArrayMaxSize(100, { message: 'Cannot delete more than 100 items per bulk request' })
  @IsUUID('all', { each: true, message: 'Each ID in the ids array must be a valid UUID' })
  ids: string[];
}

export interface FailedItem {
  id: string;
  reason: string;
}

export interface BulkDeleteResult {
  totalRequested: number;
  succeededCount: number;
  failedCount: number;
  succeededIds: string[];
  failedItems: FailedItem[];
  action: string;
}
