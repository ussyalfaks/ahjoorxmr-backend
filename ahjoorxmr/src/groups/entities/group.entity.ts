import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * Placeholder Group entity for foreign key relationships.
 * This will be fully implemented in the Groups module.
 */
@Entity('groups')
export class Group extends BaseEntity {
  @Column('varchar')
  status: string;

  @Column('int', { default: 1 })
  currentRound: number;
}
