import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('audit_logs')
@Index(['resource', 'resourceId'])
@Index(['action', 'createdAt'])
@Index(['userId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'READ';

  @Column()
  resource: string; // e.g., 'GROUP', 'USER', 'PERMISSION'

  @Column()
  resourceId: string;

  @Column('jsonb', { nullable: true })
  previousValue: Record<string, any> | null;

  @Column('jsonb', { nullable: true })
  newValue: Record<string, any> | null;

  @Column({ nullable: true })
  endpoint: string;

  @Column({ nullable: true })
  method: string;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ default: 200 })
  statusCode: number;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;
}
