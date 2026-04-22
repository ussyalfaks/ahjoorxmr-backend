import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GroupStatus } from '../enums/group-status.enum';

@Entity('groups')
export class Group {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: GroupStatus, default: GroupStatus.ACTIVE })
  status: GroupStatus;

  @Column()
  currentRound: number;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  contributionAmount: number;

  @OneToMany(() => GroupMember, (member) => member.group, { lazy: true })
  members: Promise<GroupMember[]>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('group_members')
export class GroupMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  groupId: string;

  @Column({ default: false })
  hasPaidCurrentRound: boolean;

  // Minimal user shape; expand to a proper User relation in the real codebase.
  @Column({ nullable: true })
  userName: string;

  @Column({ nullable: true })
  userEmail: string;

  // Soft FK — not using @ManyToOne here so this file is self-contained.
  group: Group;
}
