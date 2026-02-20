import { DataSource } from 'typeorm';
import { User } from './src/users/entities/user.entity';
import { Group } from './src/groups/entities/group.entity';
import { Membership } from './src/memberships/entities/membership.entity';

/**
 * TypeORM DataSource configuration for CLI migrations.
 * This file is separate from the NestJS app config to allow the TypeORM CLI
 * to load it independently for migration generation and execution.
 */
export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: 'database.sqlite', // File-based database for migrations
  entities: [User, Group, Membership],
  migrations: ['migrations/*.ts'],
  synchronize: false, // Never use synchronize with migrations
  logging: true,
});
