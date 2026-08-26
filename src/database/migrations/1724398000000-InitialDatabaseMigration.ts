import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialDatabaseMigration1724398000000 implements MigrationInterface {
  name = 'InitialDatabaseMigration1724398000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 0. Enable UUID extension in PostgreSQL
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // 1. Users table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "email" VARCHAR(255) NOT NULL UNIQUE,
        "password_hash" VARCHAR(255) NOT NULL,
        "full_name" VARCHAR(255) NOT NULL,
        "phone" VARCHAR(50),
        "address" TEXT,
        "avatar_url" TEXT,
        "role" VARCHAR(20) NOT NULL DEFAULT 'customer',
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Refresh tokens table (JWT Refresh Token Rotation & Revocation)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_tokens" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" UUID NOT NULL,
        "token_hash" VARCHAR(255) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "is_revoked" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_user" ON "refresh_tokens" ("user_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_token_hash" ON "refresh_tokens" ("token_hash");`);

    // 3. Categories table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "categories" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" VARCHAR(100) NOT NULL UNIQUE,
        "slug" VARCHAR(100) NOT NULL UNIQUE,
        "description" TEXT,
        "icon" VARCHAR(100) NOT NULL DEFAULT 'eco',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 4. Products table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "products" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "category_id" UUID,
        "name" VARCHAR(255) NOT NULL,
        "scientific_name" VARCHAR(255),
        "description" TEXT NOT NULL,
        "price" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        "stock" INTEGER NOT NULL DEFAULT 0,
        "image_url" TEXT,
        "difficulty" VARCHAR(50) NOT NULL DEFAULT 'Easy',
        "germination_days" INTEGER NOT NULL DEFAULT 7,
        "harvest_days" INTEGER NOT NULL DEFAULT 60,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_products_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_products_category" ON "products" ("category_id");`);

    // 5. Growth parameters table (Agronomic rules for State Machine)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "growth_parameters" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "product_id" UUID NOT NULL UNIQUE,
        "ideal_water_min" FLOAT NOT NULL DEFAULT 40.0,
        "ideal_water_max" FLOAT NOT NULL DEFAULT 75.0,
        "ideal_sunlight_hours_min" FLOAT NOT NULL DEFAULT 6.0,
        "ideal_sunlight_hours_max" FLOAT NOT NULL DEFAULT 10.0,
        "ideal_n_ratio" FLOAT NOT NULL DEFAULT 50.0,
        "ideal_p_ratio" FLOAT NOT NULL DEFAULT 40.0,
        "ideal_k_ratio" FLOAT NOT NULL DEFAULT 50.0,
        "min_temp" FLOAT NOT NULL DEFAULT 20.0,
        "max_temp" FLOAT NOT NULL DEFAULT 35.0,
        "soil_ph_min" FLOAT NOT NULL DEFAULT 6.0,
        "soil_ph_max" FLOAT NOT NULL DEFAULT 7.5,
        "care_tips" TEXT,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_growth_parameters_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      );
    `);

    // 6. Orders table
    // Note on delete behavior: User deletion is RESTRICTED so historical customer orders cannot be silently erased.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "orders" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" UUID NOT NULL,
        "order_number" VARCHAR(50) NOT NULL UNIQUE,
        "total_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING_PAYMENT',
        "shipping_name" VARCHAR(255) NOT NULL,
        "shipping_address" TEXT NOT NULL,
        "shipping_phone" VARCHAR(50) NOT NULL,
        "tracking_number" VARCHAR(100),
        "notes" TEXT,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_orders_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_orders_user" ON "orders" ("user_id");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_orders_status" ON "orders" ("status");`);

    // 7. Order items table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "order_items" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "order_id" UUID NOT NULL,
        "product_id" UUID NOT NULL,
        "product_name" VARCHAR(255) NOT NULL,
        "quantity" INTEGER NOT NULL DEFAULT 1,
        "unit_price" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        "subtotal" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        CONSTRAINT "FK_order_items_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_items_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_order_items_order" ON "order_items" ("order_id");`);

    // 8. Payments table (PromptPay QR slip verification)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payments" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "order_id" UUID NOT NULL UNIQUE,
        "payment_method" VARCHAR(50) NOT NULL DEFAULT 'PROMPTPAY_QR',
        "amount" DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        "slip_image_url" TEXT,
        "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING_SUBMISSION',
        "notes" TEXT,
        "verified_at" TIMESTAMP WITH TIME ZONE,
        "verified_by" UUID,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_payments_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_payments_verifier" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL
      );
    `);

    // 9. Reviews table (Objective 3 satisfaction rating)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "reviews" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "product_id" UUID NOT NULL,
        "user_id" UUID NOT NULL,
        "rating" INTEGER NOT NULL,
        "comment" TEXT NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "UQ_reviews_product_user" UNIQUE ("product_id", "user_id"),
        CONSTRAINT "FK_reviews_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_reviews_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);

    // 10. User simulations table (Saved simulation logs)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_simulations" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_user_simulations_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_user_simulations_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_simulations";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reviews";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "order_items";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "growth_parameters";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "categories";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users";`);
  }
}
