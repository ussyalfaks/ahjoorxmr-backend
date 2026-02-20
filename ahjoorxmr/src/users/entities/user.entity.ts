import { Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Placeholder User entity for foreign key relationships.
 * This will be fully implemented in the Users module.
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;
}
