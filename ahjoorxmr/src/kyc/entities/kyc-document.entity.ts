import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { KycStatus } from '../enums/kyc-status.enum';
import { KycProvider } from '../enums/kyc-provider.enum';

@Entity('kyc_documents')
@Index(['userId'])
export class KycDocument extends BaseEntity {
  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 20, default: KycStatus.PENDING })
  status: KycStatus;

  @Column({ type: 'varchar', length: 20 })
  provider: KycProvider;

  /** Provider's own reference ID for this verification */
  @Column({ type: 'varchar', length: 255, nullable: true })
  providerReferenceId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  providerPayload: Record<string, unknown> | null;
}
