import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimezoneToGroups1745000000000 implements MigrationInterface {
  name = 'AddTimezoneToGroups1745000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add startDate and endDate as TIMESTAMP WITH TIME ZONE
    await queryRunner.query(
      `ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP WITH TIME ZONE DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP WITH TIME ZONE DEFAULT NULL`,
    );
    // Add timezone field
    await queryRunner.query(
      `ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "timezone"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "endDate"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "startDate"`);
  }
}
