import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration to enhance User and Membership entities for PostgreSQL.
 * This migration adds comprehensive fields for user profiles, authentication,
 * and account management.
 */
export class EnhanceUserAndMembershipEntities1772000000000
  implements MigrationInterface
{
  name = 'EnhanceUserAndMembershipEntities1772000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add new columns to user table
    await queryRunner.query(`
      ALTER TABLE "user"
      ADD COLUMN IF NOT EXISTS "email" varchar,
      ADD COLUMN IF NOT EXISTS "username" varchar,
      ADD COLUMN IF NOT EXISTS "firstName" varchar,
      ADD COLUMN IF NOT EXISTS "lastName" varchar,
      ADD COLUMN IF NOT EXISTS "avatarUrl" varchar,
      ADD COLUMN IF NOT EXISTS "bio" text,
      ADD COLUMN IF NOT EXISTS "preferences" jsonb DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS "isActive" boolean DEFAULT true,
      ADD COLUMN IF NOT EXISTS "isVerified" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "isBanned" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "bannedAt" timestamp,
      ADD COLUMN IF NOT EXISTS "banReason" text,
      ADD COLUMN IF NOT EXISTS "lastLoginAt" timestamp,
      ADD COLUMN IF NOT EXISTS "deletedAt" timestamp
    `);

    // Create unique indexes on user table
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_email"
      ON "user" ("email")
      WHERE "email" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_username"
      ON "user" ("username")
      WHERE "username" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_walletAddress"
      ON "user" ("walletAddress")
    `);

    // Create index for sorting/filtering
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_createdAt"
      ON "user" ("createdAt")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_lastLoginAt"
      ON "user" ("lastLoginAt")
    `);

    // Add columns to membership table
    await queryRunner.query(`
      ALTER TABLE "membership"
      ADD COLUMN IF NOT EXISTS "role" varchar DEFAULT 'MEMBER',
      ADD COLUMN IF NOT EXISTS "status" varchar DEFAULT 'ACTIVE',
      ADD COLUMN IF NOT EXISTS "contributionCount" integer DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "totalContributed" decimal(15,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "joinedAt" timestamp DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS "leftAt" timestamp,
      ADD COLUMN IF NOT EXISTS "kickedAt" timestamp,
      ADD COLUMN IF NOT EXISTS "kickReason" text
    `);

    // Create composite unique index on membership
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_membership_user_group"
      ON "membership" ("userId", "groupId")
    `);

    // Create indexes for membership queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_membership_userId"
      ON "membership" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_membership_groupId"
      ON "membership" ("groupId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_membership_status"
      ON "membership" ("status")
    `);

    // Add check constraints for enums
    await queryRunner.query(`
      ALTER TABLE "membership"
      ADD CONSTRAINT "CHK_membership_role"
      CHECK ("role" IN ('OWNER', 'ADMIN', 'MEMBER'))
    `);

    await queryRunner.query(`
      ALTER TABLE "membership"
      ADD CONSTRAINT "CHK_membership_status"
      CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'BANNED'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove membership constraints and indexes
    await queryRunner.query(`
      ALTER TABLE "membership"
      DROP CONSTRAINT IF EXISTS "CHK_membership_status"
    `);

    await queryRunner.query(`
      ALTER TABLE "membership"
      DROP CONSTRAINT IF EXISTS "CHK_membership_role"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_membership_status"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_membership_groupId"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_membership_userId"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_membership_user_group"
    `);

    // Remove membership columns
    await queryRunner.query(`
      ALTER TABLE "membership"
      DROP COLUMN IF EXISTS "kickReason",
      DROP COLUMN IF EXISTS "kickedAt",
      DROP COLUMN IF EXISTS "leftAt",
      DROP COLUMN IF EXISTS "joinedAt",
      DROP COLUMN IF EXISTS "totalContributed",
      DROP COLUMN IF EXISTS "contributionCount",
      DROP COLUMN IF EXISTS "status",
      DROP COLUMN IF EXISTS "role"
    `);

    // Remove user indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_lastLoginAt"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_createdAt"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_walletAddress"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_username"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_user_email"
    `);

    // Remove user columns
    await queryRunner.query(`
      ALTER TABLE "user"
      DROP COLUMN IF EXISTS "deletedAt",
      DROP COLUMN IF EXISTS "lastLoginAt",
      DROP COLUMN IF EXISTS "banReason",
      DROP COLUMN IF EXISTS "bannedAt",
      DROP COLUMN IF EXISTS "isBanned",
      DROP COLUMN IF EXISTS "isVerified",
      DROP COLUMN IF EXISTS "isActive",
      DROP COLUMN IF EXISTS "preferences",
      DROP COLUMN IF EXISTS "bio",
      DROP COLUMN IF EXISTS "avatarUrl",
      DROP COLUMN IF EXISTS "lastName",
      DROP COLUMN IF EXISTS "firstName",
      DROP COLUMN IF EXISTS "username",
      DROP COLUMN IF EXISTS "email"
    `);
  }
}
