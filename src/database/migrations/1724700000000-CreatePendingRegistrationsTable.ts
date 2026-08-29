import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePendingRegistrationsTable1724700000000
  implements MigrationInterface
{
  name = 'CreatePendingRegistrationsTable1724700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pending_registrations" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "email" VARCHAR(255) NOT NULL UNIQUE,
        "full_name" VARCHAR(255) NOT NULL,
        "password_hash" VARCHAR(255) NOT NULL,
        "phone" VARCHAR(50) NULL,
        "address" TEXT NULL,
        "otp_code" VARCHAR(255) NOT NULL,
        "otp_expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "attempts" INT NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_pending_registrations_email" ON "pending_registrations"("email");`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pending_registrations_expires_at" ON "pending_registrations"("otp_expires_at");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pending_registrations" CASCADE;`);
  }
}
