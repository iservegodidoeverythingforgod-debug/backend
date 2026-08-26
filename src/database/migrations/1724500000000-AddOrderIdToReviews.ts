import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderIdToReviews1724500000000 implements MigrationInterface {
  name = 'AddOrderIdToReviews1724500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reviews"
      ADD COLUMN IF NOT EXISTS "order_id" UUID REFERENCES "orders"("id") ON DELETE SET NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_reviews_order_id" ON "reviews"("order_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reviews_order_id";`);
    await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN IF EXISTS "order_id";`);
  }
}
