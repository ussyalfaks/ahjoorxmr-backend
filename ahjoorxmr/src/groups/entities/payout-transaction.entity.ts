import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { PayoutTransactionStatus } from './payout-transaction-status.enum';

@Entity('payout_transactions')
@Index('IDX_payout_transactions_payoutOrderId', ['payoutOrderId'], {
  unique: true,
})
@Index('IDX_payout_transactions_status', ['status'])
export class PayoutTransaction extends BaseEntity {
  @Column('varchar', { length: 255 })
  payoutOrderId!: string;

  @Column({
    type: 'enum',
    enum: PayoutTransactionStatus,
    default: PayoutTransactionStatus.PENDING_SUBMISSION,
  })
  status!: PayoutTransactionStatus;

  @Column('varchar', { length: 255, nullable: true, default: null })
  txHash!: string | null;
}
