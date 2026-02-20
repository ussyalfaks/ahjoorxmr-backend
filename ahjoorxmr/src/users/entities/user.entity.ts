import { Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * Placeholder User entity for foreign key relationships.
 * This will be fully implemented in the Users module.
 */
@Entity('users')
export class User extends BaseEntity {}
