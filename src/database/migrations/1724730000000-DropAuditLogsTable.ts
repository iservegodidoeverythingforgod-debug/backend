import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropAuditLogsTable1724730000000 implements MigrationInterface {
  name = 'DropAuditLogsTable1724730000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs" CASCADE;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "admin_id" UUID NOT NULL,
        "action" VARCHAR(100) NOT NULL,
        "target_type" VARCHAR(100) NOT NULL,
        "target_ids" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "details" JSONB NULL,
        "status" VARCHAR(20) NOT NULL DEFAULT 'SUCCESS',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_audit_logs_admin_id" ON "audit_logs"("admin_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_audit_logs_action" ON "audit_logs"("action");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_audit_logs_created_at" ON "audit_logs"("created_at" DESC);`);
  }
}
