import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRuleBasedGrowthEngine1724440000000 implements MigrationInterface {
  name = 'CreateRuleBasedGrowthEngine1724440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create growth_rules table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "growth_rules" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" VARCHAR(255) NOT NULL,
        "description" TEXT,
        "is_default" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Create growth_stages table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "growth_stages" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "rule_id" UUID NOT NULL REFERENCES "growth_rules"("id") ON DELETE CASCADE,
        "stage_name" VARCHAR(100) NOT NULL,
        "stage_order" INTEGER NOT NULL DEFAULT 1,
        "animation" VARCHAR(255) NOT NULL DEFAULT 'foliage_lush',
        "min_day" INTEGER NOT NULL DEFAULT 1,
        "max_day" INTEGER NOT NULL DEFAULT 15,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Create growth_conditions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "growth_conditions" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "stage_id" UUID NOT NULL REFERENCES "growth_stages"("id") ON DELETE CASCADE,
        "name" VARCHAR(255) NOT NULL,
        "condition_order" INTEGER NOT NULL DEFAULT 1,
        "inputs" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "rules" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "outputs" JSONB NOT NULL DEFAULT '[]'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Add rule_id to products table
    await queryRunner.query(`
      ALTER TABLE "products"
      ADD COLUMN IF NOT EXISTS "rule_id" UUID REFERENCES "growth_rules"("id") ON DELETE SET NULL;
    `);

    // 5. Indexes for fast lookups
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_growth_stages_rule" ON "growth_stages"("rule_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_growth_conditions_stage" ON "growth_conditions"("stage_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_products_rule" ON "products"("rule_id");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN IF EXISTS "rule_id";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_conditions" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_stages" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_rules" CASCADE;`);
  }
}
