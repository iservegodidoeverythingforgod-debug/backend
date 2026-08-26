import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedSentinelDeletedUser1724520000000 implements MigrationInterface {
  name = 'SeedSentinelDeletedUser1724520000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop unique constraint on (product_id, user_id) on reviews if exists
    // so multiple historical reviews can be attributed to the sentinel deleted user account
    await queryRunner.query(`
      ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "UQ_reviews_product_user";
    `);
    await queryRunner.query(`
      ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "unique_user_product_review";
    `);

    // 2. Insert the well-known sentinel deleted user row
    await queryRunner.query(`
      INSERT INTO "users" (
        "id",
        "email",
        "password_hash",
        "full_name",
        "role",
        "is_active",
        "is_verified",
        "created_at",
        "updated_at"
      )
      VALUES (
        '00000000-0000-0000-0000-000000000001',
        'deleted-user@system.local',
        'unusable-no-login',
        'Deleted User',
        'system',
        false,
        true,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT ("id") DO UPDATE SET
        "email" = 'deleted-user@system.local',
        "full_name" = 'Deleted User',
        "role" = 'system',
        "is_active" = false,
        "is_verified" = true;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "users" WHERE "id" = '00000000-0000-0000-0000-000000000001';
    `);
  }
}
