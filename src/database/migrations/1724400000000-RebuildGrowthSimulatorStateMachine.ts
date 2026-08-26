import { MigrationInterface, QueryRunner } from 'typeorm';

export class RebuildGrowthSimulatorStateMachine1724400000000 implements MigrationInterface {
  name = 'RebuildGrowthSimulatorStateMachine1724400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Drop N-P-K ideal ratio columns from growth_parameters
    await queryRunner.query(`
      ALTER TABLE "growth_parameters"
        DROP COLUMN IF EXISTS "ideal_n_ratio",
        DROP COLUMN IF EXISTS "ideal_p_ratio",
        DROP COLUMN IF EXISTS "ideal_k_ratio";
    `);

    // 2. Add recommended N-P-K formula columns to growth_stages
    await queryRunner.query(`
      ALTER TABLE "growth_stages"
        ADD COLUMN IF NOT EXISTS "recommended_n" numeric NOT NULL DEFAULT 0 CHECK ("recommended_n" >= 0),
        ADD COLUMN IF NOT EXISTS "recommended_p" numeric NOT NULL DEFAULT 0 CHECK ("recommended_p" >= 0),
        ADD COLUMN IF NOT EXISTS "recommended_k" numeric NOT NULL DEFAULT 0 CHECK ("recommended_k" >= 0);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Revert growth_stages columns
    await queryRunner.query(`
      ALTER TABLE "growth_stages"
        DROP COLUMN IF EXISTS "recommended_n",
        DROP COLUMN IF EXISTS "recommended_p",
        DROP COLUMN IF EXISTS "recommended_k";
    `);

    // 2. Revert growth_parameters columns
    await queryRunner.query(`
      ALTER TABLE "growth_parameters"
        ADD COLUMN IF NOT EXISTS "ideal_n_ratio" FLOAT NOT NULL DEFAULT 50.0,
        ADD COLUMN IF NOT EXISTS "ideal_p_ratio" FLOAT NOT NULL DEFAULT 40.0,
        ADD COLUMN IF NOT EXISTS "ideal_k_ratio" FLOAT NOT NULL DEFAULT 50.0;
    `);
  }
}
