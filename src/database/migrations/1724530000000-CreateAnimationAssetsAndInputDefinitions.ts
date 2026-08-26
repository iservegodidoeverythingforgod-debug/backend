import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAnimationAssetsAndInputDefinitions1724530000000
  implements MigrationInterface
{
  name = 'CreateAnimationAssetsAndInputDefinitions1724530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add input_definitions column to growth_rules
    await queryRunner.query(`
      ALTER TABLE "growth_rules"
      ADD COLUMN IF NOT EXISTS "input_definitions" JSONB NOT NULL DEFAULT '[]'::jsonb;
    `);

    // 2. Create animation_assets table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "animation_assets" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" VARCHAR(255) NOT NULL,
        "file_url" TEXT NOT NULL,
        "file_type" VARCHAR(50) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Backfill default input_definitions for existing rules
    const defaultInputsJson = JSON.stringify([
      { key: 'water', type: 'number' },
      { key: 'sunlight', type: 'number' },
      { key: 'temperature', type: 'number' },
      { key: 'ph', type: 'number' },
      { key: 'n', type: 'number' },
      { key: 'p', type: 'number' },
      { key: 'k', type: 'number' },
      { key: 'day', type: 'number' },
    ]);

    await queryRunner.query(`
      UPDATE "growth_rules"
      SET "input_definitions" = '${defaultInputsJson}'::jsonb
      WHERE "input_definitions" = '[]'::jsonb OR "input_definitions" IS NULL;
    `);

    // 4. Backfill existing conditions to RuleItem schema
    const conditions = await queryRunner.query(`SELECT "id", "inputs", "rules" FROM "growth_conditions"`);
    for (const cond of conditions) {
      if (Array.isArray(cond.rules) && cond.rules.length > 0) {
        const firstRule = cond.rules[0];
        // Check if old format (has expression or output without output.rule)
        if (firstRule && (!firstRule.output || typeof firstRule.output === 'string' || firstRule.expression)) {
          const transformedRules = cond.rules.map((r: any) => {
            const expr = r.expression || r.rule || 'otherwise';
            const outStr = (r.output || 'optimal').toString();
            const desc = r.description || r.to || outStr;
            const isOptimal = outStr.toLowerCase().includes('optimal') || outStr.toLowerCase().includes('healthy');
            let severity: 'low' | 'medium' | 'high' | 'none' = 'none';
            if (!isOptimal) {
              if (outStr.toLowerCase().includes('burn') || outStr.toLowerCase().includes('critical') || outStr.toLowerCase().includes('wilting')) {
                severity = 'high';
              } else {
                severity = 'medium';
              }
            }
            return {
              input: Array.isArray(cond.inputs) && cond.inputs.length > 0 ? cond.inputs : ['water'],
              output: {
                rule: [expr],
                to: desc,
              },
              isOptimal,
              severity,
            };
          });

          await queryRunner.query(
            `UPDATE "growth_conditions" SET "rules" = $1 WHERE "id" = $2`,
            [JSON.stringify(transformedRules), cond.id],
          );
        }
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "animation_assets";`);
    await queryRunner.query(`
      ALTER TABLE "growth_rules"
      DROP COLUMN IF EXISTS "input_definitions";
    `);
  }
}
