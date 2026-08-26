import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImagesAndDetailedDescriptionToProducts1724660000000
  implements MigrationInterface
{
  name = 'AddImagesAndDetailedDescriptionToProducts1724660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add images jsonb array column with default empty array
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "images" JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);

    // 2. Add detailed_description text column nullable
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "detailed_description" TEXT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "detailed_description";
    `);
    await queryRunner.query(`
      ALTER TABLE "products"
      DROP COLUMN IF EXISTS "images";
    `);
  }
}
