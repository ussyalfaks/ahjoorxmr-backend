import {
  Entity,
  Column,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { GroupStatus } from './group-status.enum';
import { Membership } from '../../memberships/entities/membership.entity';

/**
 * Group entity representing a ROSCA savings group.
 * Mirrors the on-chain group state and serves as the source of truth for the API.
 */
@Entity('groups')
export class Group extends BaseEntity {
  @Column('varchar', { length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  contractAddress: string | null;

  @Column('varchar', { length: 255 })
  adminWallet: string;

  @Column('varchar', { length: 100 })
  contributionAmount: string;

  @Column('varchar', { length: 255 })
  token: string;

  @Column('int')
  roundDuration: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: GroupStatus.PENDING,
  })
  status: GroupStatus;

  @Column('int', { default: 0 })
  currentRound: number;

  @Column('int')
  totalRounds: number;

  @Column('int')
  minMembers: number;

  @OneToMany(() => Membership, (membership) => membership.group)
  memberships: Membership[];
}
