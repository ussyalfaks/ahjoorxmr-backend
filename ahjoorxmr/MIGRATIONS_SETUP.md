# TypeORM Migrations Setup Guide

This document explains the complete TypeORM migrations setup for this project.

## Overview

TypeORM migrations provide a controlled, reproducible way to manage database schema changes. This setup replaces the unsafe `synchronize: true` option with proper migration management.

## Files Created

### Configuration Files

1. **typeorm.config.ts** (project root)
   - DataSource configuration for TypeORM CLI
   - Separate from NestJS app config for CLI independence
   - Points to `database.sqlite` file and `migrations/` directory

2. **tsconfig.migration.json** (project root)
   - TypeScript configuration for migration scripts
   - Uses CommonJS module system for compatibility

### Migration Scripts

Located in `scripts/`:

1. **run-migrations.ts** - Applies pending migrations
2. **generate-migration.ts** - Generates new migrations from entity changes
3. **revert-migration.ts** - Reverts the last applied migration

### Migration Files

Located in `migrations/`:

1. **1740067200000-InitialSchema.ts** - Initial database schema
   - Creates `users`, `groups`, and `memberships` tables
   - Adds indexes and foreign key constraints
   - Includes rollback logic in `down()` method

## NPM Scripts

Added to `package.json`:

```json
{
  "migration:generate": "ts-node --project tsconfig.migration.json scripts/generate-migration.ts",
  "migration:run": "ts-node --project tsconfig.migration.json scripts/run-migrations.ts",
  "migration:revert": "ts-node --project tsconfig.migration.json scripts/revert-migration.ts"
}
```

## Usage

### Running Migrations

Apply all pending migrations:

```bash
npm run migration:run
```

This will:
- Initialize the database connection
- Check for pending migrations
- Execute them in order
- Log the results

### Generating New Migrations

After modifying entity files:

```bash
npm run migration:generate migrations/YourDescriptiveName
```

Example:
```bash
npm run migration:generate migrations/AddEmailToUser
```

This will:
- Compare current entities with database schema
- Generate a migration file with the differences
- Save it in the `migrations/` directory

### Reverting Migrations

To undo the last migration:

```bash
npm run migration:revert
```

This will:
- Execute the `down()` method of the last migration
- Remove it from the migrations table

## Configuration Changes

### app.module.ts

Changed from:
```typescript
synchronize: true, // Auto-create tables (disable in production)
database: ':memory:', // In-memory database
```

To:
```typescript
synchronize: false, // NEVER use synchronize in production
database: 'database.sqlite', // File-based database
migrationsRun: process.env.NODE_ENV !== 'production', // Auto-run in dev
```

### .gitignore

Added database files:
```
*.sqlite
*.sqlite-journal
*.db
```

## Initial Schema

The initial migration creates three tables:

### users
- `id` (varchar, primary key)

### groups
- `id` (varchar, primary key)
- `status` (varchar)

### memberships
- `id` (varchar, primary key)
- `groupId` (varchar, foreign key → groups.id)
- `userId` (varchar, foreign key → users.id)
- `walletAddress` (varchar)
- `payoutOrder` (integer)
- `hasReceivedPayout` (boolean, default: false)
- `hasPaidCurrentRound` (boolean, default: false)
- `status` (varchar, default: 'active')
- `createdAt` (datetime)
- `updatedAt` (datetime)

Indexes:
- `IDX_memberships_groupId` on `groupId`
- `IDX_memberships_userId` on `userId`
- `IDX_memberships_groupId_userId` (unique) on `(groupId, userId)`

## Workflow Example

1. **Add a new column to User entity:**

```typescript
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  email: string; // New column
}
```

2. **Generate migration:**

```bash
npm run migration:generate migrations/AddEmailToUser
```

3. **Review the generated file:**

```typescript
// migrations/1740067300000-AddEmailToUser.ts
export class AddEmailToUser1740067300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD "email" varchar NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "email"
    `);
  }
}
```

4. **Run the migration:**

```bash
npm run migration:run
```

5. **Commit both files:**

```bash
git add src/users/entities/user.entity.ts
git add migrations/1740067300000-AddEmailToUser.ts
git commit -m "Add email column to users table"
```

## Best Practices

1. **Never use `synchronize: true` in production** - it can cause data loss
2. **Always review generated migrations** - auto-generation isn't perfect
3. **Test migrations in development first** - catch issues early
4. **Keep migrations small and focused** - easier to review and revert
5. **Never modify applied migrations** - create a new migration instead
6. **Use descriptive names** - `AddUserEmail` not `UpdateUser`
7. **Commit migrations with code** - they're part of your codebase
8. **Run migrations before deploying** - ensure schema is up to date

## Troubleshooting

### "Cannot find module 'typeorm'"

Run `npm install` to install dependencies.

### Migration fails with "database is locked"

Close any database connections or tools accessing `database.sqlite`.

### Generated migration is empty

Ensure:
- Entities are imported in `typeorm.config.ts`
- Entity decorators are correct
- Changes are saved

### Need to reset database

```bash
rm database.sqlite
npm run migration:run
```

## Production Deployment

1. **Never use `migrationsRun: true`** in production
2. **Run migrations manually** as part of deployment:
   ```bash
   npm run migration:run
   ```
3. **Use environment variables** for database configuration
4. **Backup database** before running migrations
5. **Test rollback procedure** in staging environment

## Additional Resources

- [TypeORM Migrations Documentation](https://typeorm.io/migrations)
- [NestJS Database Documentation](https://docs.nestjs.com/techniques/database)
- Project README.md - Database Migrations section
- migrations/README.md - Quick reference guide
