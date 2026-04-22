import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: AddStaleGroupSupport
 *
 * Changes:
 *  1. Adds 'STALE' to the group_status_enum type.
 *  2. Adds the `stale_at` nullable timestamp column to the `groups` table.
 *  3. Adds 'GROUP_STALE' and 'GROUP_REACTIVATED' to the notification_type_enum type.
 */
export class AddStaleGroupSupport1711497600000 implements MigrationInterface {
  name = 'AddStaleGroupSupport1711497600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Extend the group_status enum ──────────────────────────────────────
    //
    // PostgreSQL requires renaming the old type, creating a new one, then
    // migrating the column. TypeORM's ALTER TYPE ... ADD VALUE is simpler but
    // only works outside a transaction block. We use the safe rename approach.

    await queryRunner.query(`
      ALTER TYPE "public"."group_status_enum"
      RENAME TO "group_status_enum_old"
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."group_status_enum"
      AS ENUM ('ACTIVE', 'STALE', 'ARCHIVED', 'INACTIVE')
    `);

    await queryRunner.query(`
      ALTER TABLE "groups"
        ALTER COLUMN "status" DROP DEFAULT
    `);

    await queryRunner.query(`
      ALTER TABLE "groups"
        ALTER COLUMN "status"
        TYPE "public"."group_status_enum"
        USING "status"::"text"::"public"."group_status_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "groups"
        ALTER COLUMN "status"
        SET DEFAULT 'ACTIVE'
    `);

    await queryRunner.query(`
      DROP TYPE "public"."group_status_enum_old"
    `);

    // ── 2. Add stale_at column ────────────────────────────────────────────────

    await queryRunner.query(`
      ALTER TABLE "groups"
        ADD COLUMN IF NOT EXISTS "stale_at" TIMESTAMP NULL DEFAULT NULL
    `);

    // ── 3. Index on status for efficient stale-group queries ─────────────────

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_groups_status"
        ON "groups" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_groups_last_active_at"
        ON "groups" ("last_active_at")
        WHERE "last_active_at" IS NOT NULL
    `);

    // ── 4. Extend notification_type_enum ─────────────────────────────────────

    await queryRunner.query(`
      ALTER TYPE "public"."notification_type_enum"
      RENAME TO "notification_type_enum_old"
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."notification_type_enum"
      AS ENUM (
        'GROUP_STALE',
        'GROUP_REACTIVATED',
        'CONTRIBUTION_RECEIVED',
        'ROUND_STARTED',
        'ROUND_ENDED',
        'PAYOUT_PROCESSED'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
        ALTER COLUMN "type"
        TYPE "public"."notification_type_enum"
        USING "type"::"text"::"public"."notification_type_enum"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."notification_type_enum_old"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Revert notification_type_enum ─────────────────────────────────────

    await queryRunner.query(`
      ALTER TYPE "public"."notification_type_enum"
      RENAME TO "notification_type_enum_old"
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."notification_type_enum"
      AS ENUM (
        'CONTRIBUTION_RECEIVED',
        'ROUND_STARTED',
        'ROUND_ENDED',
        'PAYOUT_PROCESSED'
      )
    `);

    // Rows with GROUP_STALE / GROUP_REACTIVATED cannot be safely downcast —
    // delete them first to avoid a cast error.
    await queryRunner.query(`
      DELETE FROM "notifications"
      WHERE "type" IN ('GROUP_STALE', 'GROUP_REACTIVATED')
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
        ALTER COLUMN "type"
        TYPE "public"."notification_type_enum"
        USING "type"::"text"::"public"."notification_type_enum"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."notification_type_enum_old"
    `);

    // ── 2. Drop indexes ───────────────────────────────────────────────────────

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_groups_last_active_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_groups_status"`);

    // ── 3. Remove stale_at column ─────────────────────────────────────────────

    await queryRunner.query(`
      ALTER TABLE "groups"
        DROP COLUMN IF EXISTS "stale_at"
    `);

    // ── 4. Revert group_status_enum ───────────────────────────────────────────

    // First reset any STALE groups back to ACTIVE so the cast doesn't fail
    await queryRunner.query(`
      UPDATE "groups" SET "status" = 'ACTIVE' WHERE "status" = 'STALE'
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."group_status_enum"
      RENAME TO "group_status_enum_old"
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."group_status_enum"
      AS ENUM ('ACTIVE', 'ARCHIVED', 'INACTIVE')
    `);

    await queryRunner.query(`
      ALTER TABLE "groups"
        ALTER COLUMN "status" DROP DEFAULT
    `);

    await queryRunner.query(`
      ALTER TABLE "groups"
        ALTER COLUMN "status"
        TYPE "public"."group_status_enum"
        USING "status"::"text"::"public"."group_status_enum"
    `);

    await queryRunner.query(`
      ALTER TABLE "groups"
        ALTER COLUMN "status"
        SET DEFAULT 'ACTIVE'
    `);

    await queryRunner.query(`
      DROP TYPE "public"."group_status_enum_old"
    `);
  }
}
