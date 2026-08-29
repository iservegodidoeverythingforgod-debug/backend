import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum AuditStatus {
  SUCCESS = 'SUCCESS',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
}

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  admin_id: string;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  action: string;

  @Column({ type: 'varchar', length: 100 })
  target_type: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  target_ids: string[];

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any>;

  @Column({
    type: 'varchar',
    length: 20,
    default: AuditStatus.SUCCESS,
  })
  status: AuditStatus;

  @Index()
  @CreateDateColumn({ type: 'timestamp with time zone' })
  created_at: Date;
}
