import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGrowthStagesTable1724399000000 implements MigrationInterface {
  name = 'CreateGrowthStagesTable1724399000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "growth_stages" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "product_id" UUID NOT NULL,
        "stage_order" INT NOT NULL DEFAULT 1,
        "stage_name" VARCHAR(255) NOT NULL,
        "start_day" INT NOT NULL DEFAULT 1,
        "end_day" INT NOT NULL DEFAULT 14,
        "description" TEXT,
        "animation_config" JSONB,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_growth_stages_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_growth_stages_product_id" ON "growth_stages" ("product_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_stages" CASCADE;`);
  }
}
