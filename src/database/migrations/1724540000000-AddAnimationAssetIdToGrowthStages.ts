import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnimationAssetIdToGrowthStages1724540000000
  implements MigrationInterface
{
  name = 'AddAnimationAssetIdToGrowthStages1724540000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add animation_asset_id column with foreign key to animation_assets table
    await queryRunner.query(`
      ALTER TABLE "growth_stages"
      ADD COLUMN IF NOT EXISTS "animation_asset_id" UUID REFERENCES "animation_assets"("id") ON DELETE SET NULL;
    `);

    // 2. Create index on animation_asset_id for performant lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_growth_stages_animation_asset_id"
      ON "growth_stages" ("animation_asset_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_growth_stages_animation_asset_id";
    `);
    await queryRunner.query(`
      ALTER TABLE "growth_stages"
      DROP COLUMN IF EXISTS "animation_asset_id";
    `);
  }
}
