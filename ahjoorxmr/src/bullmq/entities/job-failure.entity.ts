import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('job_failures')
@Index(['queueName', 'failedAt'])
@Index(['jobName'])
export class JobFailure {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 255 })
  jobId: string;

  @Column('varchar', { length: 255 })
  jobName: string;

  @Column('varchar', { length: 255 })
  queueName: string;

  @CreateDateColumn({ type: 'timestamptz' })
  failedAt: Date;

  @Column('text')
  error: string;

  @Column('text', { nullable: true })
  stackTrace: string | null;

  @Column('int', { default: 1 })
  attemptNumber: number;

  @Column('jsonb', { nullable: true })
  data: Record<string, unknown> | null;

  @Column('int', { default: 0 })
  retryCount: number;
}
