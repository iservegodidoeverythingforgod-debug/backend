import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStoreSettingsTable1724670000000
  implements MigrationInterface
{
  name = 'CreateStoreSettingsTable1724670000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create enum type if not exists
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "store_settings_promptpay_type_enum" AS ENUM('phone', 'national_id');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // 2. Create store_settings table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "store_settings" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "promptpay_id" VARCHAR(30) NOT NULL DEFAULT '0812345678',
        "promptpay_type" "store_settings_promptpay_type_enum" NOT NULL DEFAULT 'phone',
        "account_name" VARCHAR(255) NOT NULL DEFAULT 'Organic Seed & Herb Store Co., Ltd.',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_by" VARCHAR(64) NULL,
        CONSTRAINT "PK_store_settings_id" PRIMARY KEY ("id")
      );
    `);

    // 3. Insert default singleton row if table is empty
    await queryRunner.query(`
      INSERT INTO "store_settings" ("id", "promptpay_id", "promptpay_type", "account_name")
      SELECT 'a0000000-0000-0000-0000-000000000001', '0812345678', 'phone', 'Organic Seed & Herb Store Co., Ltd.'
      WHERE NOT EXISTS (SELECT 1 FROM "store_settings");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "store_settings";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "store_settings_promptpay_type_enum";`);
  }
}
