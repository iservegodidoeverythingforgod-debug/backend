import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditLogsAndChatTables1724690000000
  implements MigrationInterface
{
  name = 'CreateAuditLogsAndChatTables1724690000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create audit_logs table
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

    // 2. Create chat_conversations table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_conversations" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "customer_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
        "subject" VARCHAR(255),
        "last_message_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chat_conversations_customer" ON "chat_conversations"("customer_id", "status");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chat_conversations_last_msg" ON "chat_conversations"("last_message_at" DESC);`);

    // 3. Create chat_messages table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chat_messages" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "conversation_id" UUID NOT NULL REFERENCES "chat_conversations"("id") ON DELETE CASCADE,
        "sender_type" VARCHAR(20) NOT NULL DEFAULT 'CUSTOMER',
        "sender_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "message" TEXT NOT NULL,
        "read_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chat_messages_conv_created" ON "chat_messages"("conversation_id", "created_at" ASC);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_chat_messages_unread" ON "chat_messages"("conversation_id", "sender_type", "read_at");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_messages" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "chat_conversations" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs" CASCADE;`);
  }
}
