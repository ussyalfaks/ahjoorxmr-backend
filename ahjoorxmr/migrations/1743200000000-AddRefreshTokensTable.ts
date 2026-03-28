import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates the refresh_tokens table for JWT refresh token rotation and revocation.
 *
 * Index strategy:
 *  - idx_refresh_tokens_user_id  : fast lookup of all tokens for a user (logout-all, admin revoke)
 *  - idx_refresh_tokens_hash     : unique lookup on every /auth/refresh call
 *  - idx_refresh_tokens_expires  : efficient cleanup of expired rows by the daily BullMQ job
 */
export class AddRefreshTokensTable1743200000000 implements MigrationInterface {
  name = 'AddRefreshTokensTable1743200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"         uuid        PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
        "userId"     uuid        NOT NULL,
        "tokenHash"  varchar(255) NOT NULL UNIQUE,
        "expiresAt"  TIMESTAMP   NOT NULL,
        "revokedAt"  TIMESTAMP   DEFAULT NULL,
        "createdAt"  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" ("userId")`);
    await queryRunner.query(`CREATE INDEX "idx_refresh_tokens_expires"  ON "refresh_tokens" ("expiresAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
  }
}
