import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropUserSimulationsTable1724401000000 implements MigrationInterface {
  name = 'DropUserSimulationsTable1724401000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_simulations" CASCADE;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_simulations" (
        "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" UUID,
        "product_id" UUID NOT NULL,
        "water_input" FLOAT NOT NULL,
        "light_input" FLOAT NOT NULL,
        "n_input" FLOAT NOT NULL,
        "p_input" FLOAT NOT NULL,
        "k_input" FLOAT NOT NULL,
        "calculated_state" VARCHAR(100) NOT NULL,
        "health_score" FLOAT NOT NULL,
        "advice" TEXT,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_user_simulations_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_simulations_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      );
    `);
  }
}
