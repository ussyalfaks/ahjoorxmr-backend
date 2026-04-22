import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NotificationType } from '../enums/notification-type.enum';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  /**
   * Unique key used to prevent duplicate notifications for the same
   * logical event.  Format for CONTRIBUTION_REMINDER:
   *   `CONTRIBUTION_REMINDER:{userId}:{groupId}:{roundNumber}:{YYYY-MM-DD}`
   */
  @Index({ unique: true })
  @Column({ nullable: true })
  idempotencyKey: string;

  @Column({ default: false })
  read: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
