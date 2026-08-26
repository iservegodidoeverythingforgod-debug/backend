import { MigrationInterface, QueryRunner } from 'typeorm';

export class RestructureGrowthHierarchy1724420000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create growth_conditions table: [input, criteria, output]
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "growth_conditions" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "stage_id" UUID NOT NULL,
        "input_variable" VARCHAR(50) NOT NULL,
        "operator" VARCHAR(20) NOT NULL,
        "value" DOUBLE PRECISION NOT NULL,
        "value_max" DOUBLE PRECISION,
        "output_type" VARCHAR(50) NOT NULL,
        "output_value" JSONB NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "chk_condition_operator" CHECK ("operator" IN ('lt', 'lte', 'gt', 'gte', 'eq', 'between')),
        CONSTRAINT "chk_condition_input_variable" CHECK ("input_variable" IN ('soil_moisture', 'sunlight_hours', 'temperature', 'soil_ph', 'day')),
        CONSTRAINT "chk_condition_output_type" CHECK ("output_type" IN ('factor_status', 'status_label', 'advice_text', 'npk_override', 'animation_override'))
      );
    `);

    // 2. Add product_id, description, updated_at to growth_rules table
    await queryRunner.query(`
      ALTER TABLE "growth_rules"
      ADD COLUMN IF NOT EXISTS "product_id" UUID,
      ADD COLUMN IF NOT EXISTS "description" TEXT,
      ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    `);

    // Make old growth_stage_id on growth_rules nullable if exists
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'growth_rules' AND column_name = 'growth_stage_id'
        ) THEN
          ALTER TABLE "growth_rules" ALTER COLUMN "growth_stage_id" DROP NOT NULL;
        END IF;
      END $$;
    `);

    // 3. Add rule_id to growth_stages table
    await queryRunner.query(`
      ALTER TABLE "growth_stages"
      ADD COLUMN IF NOT EXISTS "rule_id" UUID;
    `);

    // Make product_id on growth_stages nullable
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'growth_stages' AND column_name = 'product_id'
        ) THEN
          ALTER TABLE "growth_stages" ALTER COLUMN "product_id" DROP NOT NULL;
        END IF;
      END $$;
    `);

    // 4. Foreign keys and indexes
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'fk_growth_rules_product'
        ) THEN
          ALTER TABLE "growth_rules"
          ADD CONSTRAINT "fk_growth_rules_product"
          FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'fk_growth_stages_rule'
        ) THEN
          ALTER TABLE "growth_stages"
          ADD CONSTRAINT "fk_growth_stages_rule"
          FOREIGN KEY ("rule_id") REFERENCES "growth_rules"("id") ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'fk_growth_conditions_stage'
        ) THEN
          ALTER TABLE "growth_conditions"
          ADD CONSTRAINT "fk_growth_conditions_stage"
          FOREIGN KEY ("stage_id") REFERENCES "growth_stages"("id") ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_growth_rules_product_id" ON "growth_rules"("product_id");
      CREATE INDEX IF NOT EXISTS "idx_growth_stages_rule_id" ON "growth_stages"("rule_id");
      CREATE INDEX IF NOT EXISTS "idx_growth_conditions_stage_id" ON "growth_conditions"("stage_id");
    `);

    // 5. Data Migration: Ensure every product has a System Default GrowthRule and link stages to it
    await queryRunner.query(`
      DO $$
      DECLARE
        p RECORD;
        default_rule_id UUID;
        s RECORD;
      BEGIN
        FOR p IN SELECT id, name FROM products LOOP
          -- Check if product already has a system default rule
          SELECT id INTO default_rule_id 
          FROM growth_rules 
          WHERE product_id = p.id AND is_system_default = true 
          LIMIT 1;

          IF default_rule_id IS NULL THEN
            default_rule_id := uuid_generate_v4();
            INSERT INTO growth_rules (
              id,
              product_id,
              rule_name,
              description,
              is_system_default,
              priority,
              created_at,
              updated_at
            ) VALUES (
              default_rule_id,
              p.id,
              'Standard Growth Rule',
              'Default product lifecycle stages and environmental evaluation rules',
              true,
              0,
              NOW(),
              NOW()
            );
          END IF;

          -- Link all stages belonging to this product to the default rule
          UPDATE growth_stages 
          SET rule_id = default_rule_id 
          WHERE (product_id = p.id OR rule_id IS NULL) AND rule_id IS NULL;

          -- Seed baseline conditions for each stage under this default rule if empty
          FOR s IN SELECT id FROM growth_stages WHERE rule_id = default_rule_id LOOP
            IF NOT EXISTS (SELECT 1 FROM growth_conditions WHERE stage_id = s.id) THEN
              -- 1. Soil Moisture Conditions
              INSERT INTO growth_conditions (stage_id, input_variable, operator, value, output_type, output_value)
              VALUES 
                (s.id, 'soil_moisture', 'lt', 35, 'factor_status', '{"status":"WATER_STRESS"}'::jsonb),
                (s.id, 'soil_moisture', 'gt', 80, 'factor_status', '{"status":"EXCESS_WATER"}'::jsonb),
                (s.id, 'soil_moisture', 'between', 35, 'factor_status', '{"status":"WATER_OK"}'::jsonb);
              UPDATE growth_conditions SET value_max = 80 WHERE stage_id = s.id AND input_variable = 'soil_moisture' AND operator = 'between';

              -- 2. Sunlight Conditions
              INSERT INTO growth_conditions (stage_id, input_variable, operator, value, output_type, output_value)
              VALUES 
                (s.id, 'sunlight_hours', 'lt', 5, 'factor_status', '{"status":"LOW_LIGHT"}'::jsonb),
                (s.id, 'sunlight_hours', 'gt', 12, 'factor_status', '{"status":"EXCESS_LIGHT"}'::jsonb),
                (s.id, 'sunlight_hours', 'between', 5, 'factor_status', '{"status":"LIGHT_OK"}'::jsonb);
              UPDATE growth_conditions SET value_max = 12 WHERE stage_id = s.id AND input_variable = 'sunlight_hours' AND operator = 'between';

              -- 3. Temperature Conditions
              INSERT INTO growth_conditions (stage_id, input_variable, operator, value, output_type, output_value)
              VALUES 
                (s.id, 'temperature', 'lt', 18, 'factor_status', '{"status":"LOW_TEMPERATURE"}'::jsonb),
                (s.id, 'temperature', 'gt', 36, 'factor_status', '{"status":"HIGH_TEMPERATURE"}'::jsonb),
                (s.id, 'temperature', 'between', 18, 'factor_status', '{"status":"TEMPERATURE_OK"}'::jsonb);
              UPDATE growth_conditions SET value_max = 36 WHERE stage_id = s.id AND input_variable = 'temperature' AND operator = 'between';

              -- 4. Soil pH Conditions
              INSERT INTO growth_conditions (stage_id, input_variable, operator, value, output_type, output_value)
              VALUES 
                (s.id, 'soil_ph', 'lt', 5.5, 'factor_status', '{"status":"LOW_PH"}'::jsonb),
                (s.id, 'soil_ph', 'gt', 7.8, 'factor_status', '{"status":"HIGH_PH"}'::jsonb),
                (s.id, 'soil_ph', 'between', 5.5, 'factor_status', '{"status":"PH_OK"}'::jsonb);
              UPDATE growth_conditions SET value_max = 7.8 WHERE stage_id = s.id AND input_variable = 'soil_ph' AND operator = 'between';
            END IF;
          END LOOP;
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_conditions";`);
    await queryRunner.query(`
      ALTER TABLE "growth_stages" DROP CONSTRAINT IF EXISTS "fk_growth_stages_rule";
      ALTER TABLE "growth_stages" DROP COLUMN IF EXISTS "rule_id";
    `);
    await queryRunner.query(`
      ALTER TABLE "growth_rules" DROP CONSTRAINT IF EXISTS "fk_growth_rules_product";
      ALTER TABLE "growth_rules" DROP COLUMN IF EXISTS "product_id";
      ALTER TABLE "growth_rules" DROP COLUMN IF EXISTS "description";
      ALTER TABLE "growth_rules" DROP COLUMN IF EXISTS "updated_at";
    `);
  }
}
