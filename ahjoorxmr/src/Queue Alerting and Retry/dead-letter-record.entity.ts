import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('dead_letters')
@Index(['groupId', 'createdAt'])
@Index(['status', 'createdAt'])
export class DeadLetterRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  jobId: string;

  @Column()
  groupId: string;

  @Column()
  queueName: string;

  @Column('text')
  error: string;

  @Column('jsonb', { nullable: true })
  payload: any;

  @Column({
    type: 'enum',
    enum: ['PENDING', 'RESOLVED'],
    default: 'PENDING',
  })
  status: 'PENDING' | 'RESOLVED';

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  resolvedAt: Date;

  @Column({ nullable: true })
  resolvedBy: string;

  @Column('text', { nullable: true })
  resolutionNotes: string;
}
