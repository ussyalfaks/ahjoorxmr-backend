# Database Migrations

This directory contains TypeORM migration files that track all database schema changes.

## Migration Files

Each migration file follows the naming pattern: `{timestamp}-{DescriptiveName}.ts`

Example: `1740067200000-InitialSchema.ts`

## How Migrations Work

Migrations are TypeScript classes that implement two methods:

- `up()`: Applies the schema change (e.g., create table, add column)
- `down()`: Reverts the schema change (rollback)

## Commands

```bash
# Generate a new migration from entity changes
npm run migration:generate migrations/DescriptiveName

# Apply all pending migrations
npm run migration:run

# Revert the last migration
npm run migration:revert
```

## Best Practices

1. **Always review generated migrations** before running them
2. **Test in development first** before applying to production
3. **Never modify a migration** that has been run in production
4. **Keep migrations focused** - one logical change per migration
5. **Use descriptive names** - `AddUserEmail` not `UpdateUser`
6. **Commit migrations with code** - they're part of your codebase

## Migration Workflow

1. Modify your entity files (add/remove columns, change types, etc.)
2. Generate a migration: `npm run migration:generate migrations/YourChangeName`
3. Review the generated SQL in the migration file
4. Test the migration: `npm run migration:run`
5. If needed, revert: `npm run migration:revert`
6. Commit both entity and migration files

## Configuration

Migrations are configured in `typeorm.config.ts` at the project root. This file is separate from the NestJS app configuration to allow the TypeORM CLI to run independently.

## Initial Migration

The `InitialSchema` migration creates the base tables:
- `users` - User accounts
- `groups` - ROSCA groups
- `memberships` - User memberships in groups with status tracking

## Troubleshooting

**Migration fails to run:**
- Check that `database.sqlite` is not locked by another process
- Verify entity imports in `typeorm.config.ts`
- Ensure TypeScript compiles without errors

**Generated migration is empty:**
- Make sure entities are properly imported in `typeorm.config.ts`
- Verify decorators are correctly applied to entity properties
- Check that you've saved all entity file changes

**Need to reset database:**
```bash
rm database.sqlite
npm run migration:run
```
