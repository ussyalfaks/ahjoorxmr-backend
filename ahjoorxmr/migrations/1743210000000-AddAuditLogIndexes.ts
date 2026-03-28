import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds performance indexes to the audit_logs table.
 *
 * Index strategy:
 *  - idx_audit_user_id       : filters by userId (most common access pattern)
 *  - idx_audit_resource      : filters by resource (entity type)
 *  - idx_audit_created_at    : ORDER BY timestamp DESC range scans
 *  - idx_audit_user_created  : composite (userId, timestamp DESC) for
 *                              "recent activity for a user" queries
 *
 * Without these indexes every filter/sort on a growing audit_logs table
 * performs a sequential scan. EXPLAIN ANALYZE on a seeded dataset confirms
 * index scans are used after this migration runs.
 *
 * Usage example (confirms index scan):
 *   EXPLAIN ANALYZE
 *   SELECT * FROM audit_logs
 *   WHERE "userId" = '<uuid>'
 *   ORDER BY "timestamp" DESC
 *   LIMIT 50;
 */
export class AddAuditLogIndexes1743210000000 implements MigrationInterface {
  name = 'AddAuditLogIndexes1743210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // idx_audit_user_id — fast lookup by userId
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_user_id" ON "audit_logs" ("userId")`,
    );

    // idx_audit_resource — fast lookup by resource (entity type)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_resource" ON "audit_logs" ("resource")`,
    );

    // idx_audit_created_at — supports ORDER BY timestamp DESC with LIMIT
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_created_at" ON "audit_logs" ("timestamp" DESC)`,
    );

    // idx_audit_user_created — composite for "recent activity for a user"
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_audit_user_created" ON "audit_logs" ("userId", "timestamp" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_user_created"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_resource"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_user_id"`);
  }
}
