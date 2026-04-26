import { Entity, Column } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { KycStatus } from '../../kyc/enums/kyc-status.enum';

/**
 * User entity. kycStatus tracks the result of identity verification.
 */
@Entity('users')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  walletAddress: string | null;

  @Column({ type: 'varchar', length: 20, default: KycStatus.PENDING })
  kycStatus: KycStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  refreshTokenHash: string | null;
}
