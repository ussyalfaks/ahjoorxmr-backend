import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * Placeholder Group entity for foreign key relationships.
 * This will be fully implemented in the Groups module.
 */
@Entity('groups')
export class Group {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar')
  status: string;
}
