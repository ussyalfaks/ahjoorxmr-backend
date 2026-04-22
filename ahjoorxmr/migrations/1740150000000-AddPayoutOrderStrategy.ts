import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayoutOrderStrategy1740150000000
  implements MigrationInterface
{
  name = 'AddPayoutOrderStrategy1740150000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add payoutOrderStrategy column to groups table with default value
    await queryRunner.query(`
      ALTER TABLE "groups" 
      ADD COLUMN "payoutOrderStrategy" varchar(20) NOT NULL DEFAULT 'SEQUENTIAL'
    `);

    // Modify payoutOrder column in memberships table to allow NULL
    // SQLite doesn't support ALTER COLUMN directly, so we need to recreate the table
    await queryRunner.query(`
      CREATE TABLE "memberships_new" (
        "id" varchar PRIMARY KEY NOT NULL,
        "groupId" varchar NOT NULL,
        "userId" varchar NOT NULL,
        "walletAddress" varchar(255) NOT NULL,
        "payoutOrder" integer,
        "hasReceivedPayout" boolean NOT NULL DEFAULT (0),
        "hasPaidCurrentRound" boolean NOT NULL DEFAULT (0),
        "status" varchar(20) NOT NULL DEFAULT ('ACTIVE'),
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
        CONSTRAINT "FK_memberships_groupId" FOREIGN KEY ("groupId") REFERENCES "groups" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_memberships_userId" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    // Copy data from old table to new table
    await queryRunner.query(`
      INSERT INTO "memberships_new" 
      SELECT * FROM "memberships"
    `);

    // Drop old table
    await queryRunner.query(`DROP TABLE "memberships"`);

    // Rename new table to original name
    await queryRunner.query(`
      ALTER TABLE "memberships_new" RENAME TO "memberships"
    `);

    // Recreate indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_memberships_groupId" ON "memberships" ("groupId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_memberships_userId" ON "memberships" ("userId")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_memberships_groupId_userId" ON "memberships" ("groupId", "userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove payoutOrderStrategy column from groups table
    // SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
    await queryRunner.query(`
      CREATE TABLE "groups_new" (
        "id" varchar PRIMARY KEY NOT NULL,
        "status" varchar NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
        "updatedAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await queryRunner.query(`
      INSERT INTO "groups_new" ("id", "status", "createdAt", "updatedAt")
      SELECT "id", "status", "createdAt", "updatedAt" FROM "groups"
    `);

    await queryRunner.query(`DROP TABLE "groups"`);

    await queryRunner.query(`
      ALTER TABLE "groups_new" RENAME TO "groups"
    `);

    // Revert payoutOrder column to NOT NULL
    await queryRunner.query(`
      CREATE TABLE "memberships_new" (
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

    await queryRunner.query(`
      INSERT INTO "memberships_new" 
      SELECT * FROM "memberships"
    `);

    await queryRunner.query(`DROP TABLE "memberships"`);

    await queryRunner.query(`
      ALTER TABLE "memberships_new" RENAME TO "memberships"
    `);

    // Recreate indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_memberships_groupId" ON "memberships" ("groupId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_memberships_userId" ON "memberships" ("userId")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_memberships_groupId_userId" ON "memberships" ("groupId", "userId")
    `);
  }
}
