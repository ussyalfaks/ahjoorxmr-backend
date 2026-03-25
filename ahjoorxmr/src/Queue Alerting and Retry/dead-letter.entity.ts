import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type DeadLetterStatus = 'PENDING' | 'RESOLVED' | 'PAUSED' | 'IGNORED';

@Entity('dead_letters')
@Index(['groupId', 'recordedAt'])
@Index(['status', 'recordedAt'])
@Index(['jobType', 'recordedAt'])
export class DeadLetterRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  jobId: string;

  @Column()
  groupId: string;

  @Column()
  jobType: string;

  @Column('jsonb')
  payload: Record<string, any>;

  @Column('text')
  error: string;

  @Column('text', { nullable: true })
  stackTrace?: string;

  @Column('int')
  attemptCount: number;

  @Column({
    type: 'varchar',
    default: 'PENDING',
  })
  status: DeadLetterStatus;

  @CreateDateColumn()
  recordedAt: Date;

  @Column({ nullable: true })
  resolvedAt?: Date;

  @Column('text', { nullable: true })
  resolutionNotes?: string;

  @Column({ nullable: true })
  resolvedBy?: string;
}
