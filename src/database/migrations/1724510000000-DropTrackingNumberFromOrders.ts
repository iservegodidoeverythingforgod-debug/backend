import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropTrackingNumberFromOrders1724510000000 implements MigrationInterface {
  name = 'DropTrackingNumberFromOrders1724510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      DROP COLUMN IF EXISTS "tracking_number";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orders"
      ADD COLUMN IF NOT EXISTS "tracking_number" VARCHAR(100);
    `);
  }
}
