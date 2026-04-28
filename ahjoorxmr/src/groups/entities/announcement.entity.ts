import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
  DeleteDateColumn,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Group } from './group.entity';

/**
 * Represents an admin-authored announcement broadcast to all group members.
 * Pinned announcements always appear first in the list regardless of createdAt order.
 * Soft-deletes are used so history can be audited.
 */
@Entity('announcements')
@Index('IDX_announcements_groupId_createdAt', ['groupId', 'createdAt'])
export class Announcement extends BaseEntity {
  @Column('uuid')
  @Index()
  groupId: string;

  @ManyToOne(() => Group, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'groupId' })
  group: Group;

  @Column('uuid')
  authorId: string;

  @Column('varchar', { length: 255 })
  title: string;

  @Column('text')
  body: string;

  @Column('boolean', { default: false })
  isPinned: boolean;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;
}
