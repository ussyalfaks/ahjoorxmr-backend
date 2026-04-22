import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('contributions')
@Unique(['groupId', 'userId', 'roundNumber'])
@Index(['groupId', 'userId', 'roundNumber'])
export class Contribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  groupId: string;

  @Column('uuid')
  userId: string;

  @Column('integer')
  roundNumber: number;

  @Column('varchar', { length: 512 })
  transactionHash: string;

  @Column('decimal', { precision: 20, scale: 8 })
  amount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
