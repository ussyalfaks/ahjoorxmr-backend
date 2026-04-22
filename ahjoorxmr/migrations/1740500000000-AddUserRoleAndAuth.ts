import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserRoleAndAuth1740500000000 implements MigrationInterface {
  name = 'AddUserRoleAndAuth1740500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create users table if it doesn't exist
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    // Add walletAddress column
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN IF NOT EXISTS "walletAddress" character varying NOT NULL
    `);

    // Add unique constraint on walletAddress
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_walletAddress" 
      ON "users" ("walletAddress")
    `);

    // Create enum type for user roles
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "user_role_enum" AS ENUM('admin', 'user', 'moderator');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Add role column with default value
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN IF NOT EXISTS "role" "user_role_enum" NOT NULL DEFAULT 'user'
    `);

    // Add refreshTokenHash column
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD COLUMN IF NOT EXISTS "refreshTokenHash" character varying
    `);

    // Create audit_logs table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "action" character varying NOT NULL,
        "entityType" character varying NOT NULL,
        "entityId" character varying NOT NULL,
        "userId" character varying NOT NULL,
        "metadata" jsonb,
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    // Create index on audit logs for faster queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_action" 
      ON "audit_logs" ("action")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_entityType" 
      ON "audit_logs" ("entityType")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_userId" 
      ON "audit_logs" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_audit_logs_createdAt" 
      ON "audit_logs" ("createdAt" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop audit logs table
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);

    // Drop user columns
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "refreshTokenHash"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "role"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_walletAddress"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "walletAddress"`);

    // Drop enum type
    await queryRunner.query(`DROP TYPE IF EXISTS "user_role_enum"`);
  }
}
