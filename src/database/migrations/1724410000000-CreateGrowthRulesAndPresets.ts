import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGrowthRulesAndPresets1724410000000 implements MigrationInterface {
  name = 'CreateGrowthRulesAndPresets1724410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create animation_presets table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "animation_presets" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "preset_key" VARCHAR(100) NOT NULL UNIQUE,
        "display_name" VARCHAR(255) NOT NULL,
        "asset" TEXT NOT NULL,
        "loop" BOOLEAN NOT NULL DEFAULT true,
        "speed" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
        "fallback_type" VARCHAR(50),
        "fallback_asset" TEXT,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Create growth_rules table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "growth_rules" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "growth_stage_id" UUID NOT NULL,
        "created_by" UUID,
        "rule_name" VARCHAR(255) NOT NULL,
        "logic_operator" VARCHAR(10) NOT NULL DEFAULT 'AND' CHECK ("logic_operator" IN ('AND', 'OR')),
        "priority" INT NOT NULL DEFAULT 0,
        "is_system_default" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_growth_rules_stage" FOREIGN KEY ("growth_stage_id")
          REFERENCES "growth_stages"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_growth_rules_creator" FOREIGN KEY ("created_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);

    // 3. Create growth_rule_conditions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "growth_rule_conditions" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "rule_id" UUID NOT NULL,
        "variable" VARCHAR(50) NOT NULL,
        "operator" VARCHAR(20) NOT NULL CHECK ("operator" IN ('lt', 'lte', 'gt', 'gte', 'eq', 'between')),
        "value" DOUBLE PRECISION NOT NULL,
        "value_max" DOUBLE PRECISION,
        CONSTRAINT "FK_conditions_rule" FOREIGN KEY ("rule_id")
          REFERENCES "growth_rules"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_between_requires_max" CHECK ("operator" != 'between' OR "value_max" IS NOT NULL)
      );
    `);

    // 4. Create growth_rule_outputs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "growth_rule_outputs" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "rule_id" UUID NOT NULL,
        "output_type" VARCHAR(50) NOT NULL CHECK ("output_type" IN ('status_label', 'advice_text', 'npk_override', 'animation_override')),
        "output_value" JSONB NOT NULL,
        CONSTRAINT "FK_outputs_rule" FOREIGN KEY ("rule_id")
          REFERENCES "growth_rules"("id") ON DELETE CASCADE
      );
    `);

    // 5. Create indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_growth_rules_stage" ON "growth_rules"("growth_stage_id");
      CREATE INDEX IF NOT EXISTS "idx_growth_rules_creator" ON "growth_rules"("created_by");
      CREATE INDEX IF NOT EXISTS "idx_growth_rule_conditions_rule" ON "growth_rule_conditions"("rule_id");
      CREATE INDEX IF NOT EXISTS "idx_growth_rule_outputs_rule" ON "growth_rule_outputs"("rule_id");
    `);

    // 6. Create race-condition-safe DB trigger function & trigger for 10-rule cap per stage per user
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION check_growth_rule_user_limit()
      RETURNS TRIGGER AS $$
      DECLARE
        rule_count INTEGER;
      BEGIN
        IF NEW.is_system_default = false AND NEW.created_by IS NOT NULL THEN
          SELECT COUNT(*) INTO rule_count
          FROM "growth_rules"
          WHERE "growth_stage_id" = NEW.growth_stage_id
            AND "created_by" = NEW.created_by;
          IF rule_count >= 10 THEN
            RAISE EXCEPTION 'Maximum rule limit (10 rules per stage) reached for this user'
              USING ERRCODE = 'check_violation';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_check_growth_rule_user_limit ON "growth_rules";
      CREATE TRIGGER trg_check_growth_rule_user_limit
      BEFORE INSERT ON "growth_rules"
      FOR EACH ROW
      EXECUTE FUNCTION check_growth_rule_user_limit();
    `);

    // 7. Seed initial admin-curated animation presets
    await queryRunner.query(`
      INSERT INTO "animation_presets" ("preset_key", "display_name", "asset", "loop", "speed", "fallback_type", "fallback_asset")
      VALUES
        ('healthy', 'Healthy Vigorous Growth', 'assets/animations/healthy_growth.json', true, 1.0, 'svg', 'assets/svg/healthy_growth.svg'),
        ('wilted', 'Wilted / Severe Water Stress', 'assets/animations/wilted_plant.json', true, 1.0, 'svg', 'assets/svg/wilted_plant.svg'),
        ('overwatered', 'Overwatered / Root Rot Risk', 'assets/animations/overwatered_plant.json', true, 1.0, 'svg', 'assets/svg/overwatered_plant.svg'),
        ('nutrient_deficient', 'Nutrient Deficiency (Yellowing Leaves)', 'assets/animations/chlorosis_plant.json', true, 1.0, 'svg', 'assets/svg/chlorosis_plant.svg'),
        ('heat_stress', 'Heat Stress / Scorched Foliage', 'assets/animations/heat_stress_plant.json', true, 1.0, 'svg', 'assets/svg/heat_stress_plant.svg')
      ON CONFLICT ("preset_key") DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_check_growth_rule_user_limit ON "growth_rules";`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS check_growth_rule_user_limit();`);
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_rule_outputs" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_rule_conditions" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_rules" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "animation_presets" CASCADE;`);
  }
}
