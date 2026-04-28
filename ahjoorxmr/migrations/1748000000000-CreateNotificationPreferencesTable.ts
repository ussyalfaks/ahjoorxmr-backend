import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationPreferencesTable1748000000000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_preferences" (
        "id"          uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "userId"      uuid              NOT NULL,
        "preferences" jsonb             NOT NULL DEFAULT '{}',
        "createdAt"   TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_preferences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_preferences_userId" UNIQUE ("userId")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_notification_preferences_userId"
        ON "notification_preferences" ("userId")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notification_preferences"`);
  }
}
