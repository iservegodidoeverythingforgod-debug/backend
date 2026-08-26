import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveGrowthSimulatorTables1724430000000 implements MigrationInterface {
  name = 'RemoveGrowthSimulatorTables1724430000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop Growth Simulator tables
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_conditions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_stages" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_rules" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_parameters" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "animation_presets" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_rule_conditions" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_rule_outputs" CASCADE`);

    // 2. Update order_items to allow null product_id with ON DELETE SET NULL
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_order_items_product'
        ) THEN
          ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_product";
        END IF;
      END $$;
    `);

    // Make product_id nullable
    await queryRunner.query(`ALTER TABLE "order_items" ALTER COLUMN "product_id" DROP NOT NULL`);

    // Re-add foreign key with ON DELETE SET NULL
    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD CONSTRAINT "FK_order_items_product"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback schema changes
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'FK_order_items_product'
        ) THEN
          ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_product";
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items"
      ADD CONSTRAINT "FK_order_items_product"
      FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT
    `);
  }
}
