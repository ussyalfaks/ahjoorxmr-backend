import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { MembershipStatus } from './membership-status.enum';
import { Group } from '../../groups/entities/group.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Membership entity representing a user's participation in a ROSCA group.
 * Tracks membership status, payout order, and contribution flags.
 */
@Entity('memberships')
@Unique(['groupId', 'userId'])
export class Membership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index()
  groupId: string;

  @ManyToOne(() => Group)
  @JoinColumn({ name: 'groupId' })
  group: Group;

  @Column('uuid')
  @Index()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('varchar', { length: 255 })
  walletAddress: string;

  @Column('int')
  payoutOrder: number;

  @Column('boolean', { default: false })
  hasReceivedPayout: boolean;

  @Column('boolean', { default: false })
  hasPaidCurrentRound: boolean;

  // Note: Using varchar instead of enum for SQLite compatibility
  // For PostgreSQL, you can use: type: 'enum', enum: MembershipStatus
  @Column({
    type: 'varchar',
    length: 20,
    default: MembershipStatus.ACTIVE,
  })
  status: MembershipStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
