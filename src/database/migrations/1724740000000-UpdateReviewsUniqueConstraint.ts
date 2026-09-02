import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateReviewsUniqueConstraint1724740000000 implements MigrationInterface {
  name = 'UpdateReviewsUniqueConstraint1724740000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop legacy table-wide (product_id, user_id) unique constraint
    await queryRunner.query(`
      ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "UQ_reviews_product_user";
    `);

    // 2. Create unique index for order-backed reviews (1 review per product in an order)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_reviews_order_product_user"
      ON "reviews" ("order_id", "product_id", "user_id")
      WHERE "order_id" IS NOT NULL;
    `);

    // 3. Create unique index for standalone product reviews (1 review per product per user when no order_id)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_reviews_standalone_product_user"
      ON "reviews" ("product_id", "user_id")
      WHERE "order_id" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reviews_standalone_product_user";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reviews_order_product_user";`);
    await queryRunner.query(`
      ALTER TABLE "reviews"
      ADD CONSTRAINT "UQ_reviews_product_user" UNIQUE ("product_id", "user_id");
    `);
  }
}
