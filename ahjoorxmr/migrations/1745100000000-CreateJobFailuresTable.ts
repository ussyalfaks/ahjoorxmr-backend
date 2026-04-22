import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateJobFailuresTable1745100000000 implements MigrationInterface {
  name = 'CreateJobFailuresTable1745100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "job_failures" (
        "id" UUID NOT NULL DEFAULT gen_random_uuid(),
        "jobId" VARCHAR(255) NOT NULL,
        "jobName" VARCHAR(255) NOT NULL,
        "queueName" VARCHAR(255) NOT NULL,
        "failedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "error" TEXT NOT NULL,
        "stackTrace" TEXT,
        "attemptNumber" INTEGER NOT NULL DEFAULT 1,
        "data" JSONB,
        "retryCount" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "PK_job_failures" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_job_failures_queue_failed" ON "job_failures" ("queueName", "failedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_job_failures_job_name" ON "job_failures" ("jobName")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "job_failures"`);
  }
}
