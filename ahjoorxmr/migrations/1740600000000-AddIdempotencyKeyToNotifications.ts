import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIdempotencyKeyToNotifications1740600000000 implements MigrationInterface {
  name = 'AddIdempotencyKeyToNotifications1740600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD COLUMN "idempotencyKey" varchar(255) NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_notifications_idempotencyKey"
      ON "notifications" ("idempotencyKey")
      WHERE "idempotencyKey" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_notifications_idempotencyKey"
    `);

    await queryRunner.query(`
      ALTER TABLE "notifications"
      DROP COLUMN "idempotencyKey"
    `);
  }
}
