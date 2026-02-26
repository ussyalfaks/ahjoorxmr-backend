import { MigrationInterface, QueryRunner } from "typeorm";

export class Add2FAFields1771970077530 implements MigrationInterface {
    name = 'Add2FAFields1771970077530'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "users" ("id" varchar PRIMARY KEY NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "twoFactorSecret" varchar, "twoFactorEnabled" boolean NOT NULL DEFAULT (0), "backupCodes" text)`);
        await queryRunner.query(`CREATE TABLE "memberships" ("id" varchar PRIMARY KEY NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "groupId" varchar NOT NULL, "userId" varchar NOT NULL, "walletAddress" varchar(255) NOT NULL, "payoutOrder" integer NOT NULL, "hasReceivedPayout" boolean NOT NULL DEFAULT (0), "hasPaidCurrentRound" boolean NOT NULL DEFAULT (0), "status" varchar(20) NOT NULL DEFAULT ('ACTIVE'), CONSTRAINT "UQ_1b73e5ee75de28dea0b6172841d" UNIQUE ("groupId", "userId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0cd1858e93877b2ef239d4cf92" ON "memberships" ("groupId") `);
        await queryRunner.query(`CREATE INDEX "IDX_187d573e43b2c2aa3960df20b7" ON "memberships" ("userId") `);
        await queryRunner.query(`CREATE TABLE "groups" ("id" varchar PRIMARY KEY NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "name" varchar(255) NOT NULL, "contractAddress" varchar(255), "adminWallet" varchar(255) NOT NULL, "contributionAmount" varchar(100) NOT NULL, "token" varchar(255) NOT NULL, "roundDuration" integer NOT NULL, "status" varchar(20) NOT NULL DEFAULT ('PENDING'), "currentRound" integer NOT NULL DEFAULT (0), "totalRounds" integer NOT NULL, "minMembers" integer NOT NULL)`);
        await queryRunner.query(`DROP INDEX "IDX_0cd1858e93877b2ef239d4cf92"`);
        await queryRunner.query(`DROP INDEX "IDX_187d573e43b2c2aa3960df20b7"`);
        await queryRunner.query(`CREATE TABLE "temporary_memberships" ("id" varchar PRIMARY KEY NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "groupId" varchar NOT NULL, "userId" varchar NOT NULL, "walletAddress" varchar(255) NOT NULL, "payoutOrder" integer NOT NULL, "hasReceivedPayout" boolean NOT NULL DEFAULT (0), "hasPaidCurrentRound" boolean NOT NULL DEFAULT (0), "status" varchar(20) NOT NULL DEFAULT ('ACTIVE'), CONSTRAINT "UQ_1b73e5ee75de28dea0b6172841d" UNIQUE ("groupId", "userId"), CONSTRAINT "FK_0cd1858e93877b2ef239d4cf92c" FOREIGN KEY ("groupId") REFERENCES "groups" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION, CONSTRAINT "FK_187d573e43b2c2aa3960df20b78" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_memberships"("id", "createdAt", "updatedAt", "groupId", "userId", "walletAddress", "payoutOrder", "hasReceivedPayout", "hasPaidCurrentRound", "status") SELECT "id", "createdAt", "updatedAt", "groupId", "userId", "walletAddress", "payoutOrder", "hasReceivedPayout", "hasPaidCurrentRound", "status" FROM "memberships"`);
        await queryRunner.query(`DROP TABLE "memberships"`);
        await queryRunner.query(`ALTER TABLE "temporary_memberships" RENAME TO "memberships"`);
        await queryRunner.query(`CREATE INDEX "IDX_0cd1858e93877b2ef239d4cf92" ON "memberships" ("groupId") `);
        await queryRunner.query(`CREATE INDEX "IDX_187d573e43b2c2aa3960df20b7" ON "memberships" ("userId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_187d573e43b2c2aa3960df20b7"`);
        await queryRunner.query(`DROP INDEX "IDX_0cd1858e93877b2ef239d4cf92"`);
        await queryRunner.query(`ALTER TABLE "memberships" RENAME TO "temporary_memberships"`);
        await queryRunner.query(`CREATE TABLE "memberships" ("id" varchar PRIMARY KEY NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "groupId" varchar NOT NULL, "userId" varchar NOT NULL, "walletAddress" varchar(255) NOT NULL, "payoutOrder" integer NOT NULL, "hasReceivedPayout" boolean NOT NULL DEFAULT (0), "hasPaidCurrentRound" boolean NOT NULL DEFAULT (0), "status" varchar(20) NOT NULL DEFAULT ('ACTIVE'), CONSTRAINT "UQ_1b73e5ee75de28dea0b6172841d" UNIQUE ("groupId", "userId"))`);
        await queryRunner.query(`INSERT INTO "memberships"("id", "createdAt", "updatedAt", "groupId", "userId", "walletAddress", "payoutOrder", "hasReceivedPayout", "hasPaidCurrentRound", "status") SELECT "id", "createdAt", "updatedAt", "groupId", "userId", "walletAddress", "payoutOrder", "hasReceivedPayout", "hasPaidCurrentRound", "status" FROM "temporary_memberships"`);
        await queryRunner.query(`DROP TABLE "temporary_memberships"`);
        await queryRunner.query(`CREATE INDEX "IDX_187d573e43b2c2aa3960df20b7" ON "memberships" ("userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_0cd1858e93877b2ef239d4cf92" ON "memberships" ("groupId") `);
        await queryRunner.query(`DROP TABLE "groups"`);
        await queryRunner.query(`DROP INDEX "IDX_187d573e43b2c2aa3960df20b7"`);
        await queryRunner.query(`DROP INDEX "IDX_0cd1858e93877b2ef239d4cf92"`);
        await queryRunner.query(`DROP TABLE "memberships"`);
        await queryRunner.query(`DROP TABLE "users"`);
    }

}
