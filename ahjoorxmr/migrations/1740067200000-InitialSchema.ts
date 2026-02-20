import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1740067200000 implements MigrationInterface {
  name = 'InitialSchema1740067200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" varchar PRIMARY KEY NOT NULL
      )
    `);

    // Create groups table
    await queryRunner.query(`
      CREATE TABLE "groups" (
        "id" varchar PRIMARY KEY NOT NULL,
        "status" varchar NOT NULL
      )
    `);

    // Create memberships table
    await queryRunner.query(`
      CREATE TABLE "memberships" (
        "id" varchar PRIMARY KEY NOT NULL,
        "groupId" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "walletAddress" varchar(255) NOT NULL,
        "payoutOrder" integer NOT NULL,
        "hasReceivedPayout" boolean NOT NULL DEFAULT (0),
        "hasPaidCurrentRound" boolean NOT NULL DEFAULT (0),
        "status" varchar(20) NOT NULL DEFAULT ('active'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_memberships_groupId" FOREIGN KEY ("groupId") REFERENCES "groups" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_memberships_userId" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_memberships_groupId" ON "memberships" ("groupId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_memberships_userId" ON "memberships" ("userId")
    `);

    // Create unique constraint
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_memberships_groupId_userId" ON "memberships" ("groupId", "userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX "IDX_memberships_groupId_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_memberships_userId"`);
    await queryRunner.query(`DROP INDEX "IDX_memberships_groupId"`);

    // Drop tables in reverse order
    await queryRunner.query(`DROP TABLE "memberships"`);
    await queryRunner.query(`DROP TABLE "groups"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
