import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * Audit log entity.
 *
 * Index strategy (see migration 1743210000000-AddAuditLogIndexes):
 *  - idx_audit_user_id      : single-column on userId
 *  - idx_audit_resource     : single-column on resource
 *  - idx_audit_created_at   : single-column on timestamp DESC
 *  - idx_audit_user_created : composite (userId, timestamp DESC) for
 *                             "recent activity for a user" queries
 */
@Entity('audit_logs')
@Index('idx_audit_user_id', ['userId'])
@Index('idx_audit_resource', ['resource'])
@Index('idx_audit_created_at', ['timestamp'])
@Index('idx_audit_user_created', ['userId', 'timestamp'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  userId: string;

  @Column()
  action: string;

  @Column()
  resource: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  timestamp: Date;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;

  @Column({ type: 'jsonb', nullable: true })
  requestPayload: Record<string, any>;
}
