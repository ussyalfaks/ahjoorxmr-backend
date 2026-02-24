import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * User entity with Two-Factor Authentication support.
 */
@Entity('users')
export class User extends BaseEntity {
  @Column({ nullable: true })
  twoFactorSecret?: string;

  @Column({ default: false })
  twoFactorEnabled: boolean;

  @Column('simple-array', { nullable: true })
  backupCodes?: string[];
}
