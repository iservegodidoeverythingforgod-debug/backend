import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropSlugFromCategories1724710000000 implements MigrationInterface {
  name = 'DropSlugFromCategories1724710000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories"
      DROP COLUMN IF EXISTS "slug";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "categories"
      ADD COLUMN IF NOT EXISTS "slug" VARCHAR(100) UNIQUE;
    `);
  }
}
