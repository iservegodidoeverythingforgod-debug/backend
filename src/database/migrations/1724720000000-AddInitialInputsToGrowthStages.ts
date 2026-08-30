import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInitialInputsToGrowthStages1724720000000 implements MigrationInterface {
  name = 'AddInitialInputsToGrowthStages1724720000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "growth_stages"
      ADD COLUMN IF NOT EXISTS "initial_inputs" JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "growth_stages"
      DROP COLUMN IF EXISTS "initial_inputs";
    `);
  }
}
