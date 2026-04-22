import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { JOB_NAMES, QUEUE_NAMES } from './queue.constants';
import { ReconcilePayoutJobData } from './queue.interfaces';
import { PayoutTransaction } from '../groups/entities/payout-transaction.entity';
import { PayoutTransactionStatus } from '../groups/entities/payout-transaction-status.enum';
import { StellarService } from '../stellar/stellar.service';

@Processor(QUEUE_NAMES.PAYOUT_RECONCILIATION, { concurrency: 2 })
export class PayoutReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(PayoutReconciliationProcessor.name);

  constructor(
    @InjectRepository(PayoutTransaction)
    private readonly payoutTransactionRepository: Repository<PayoutTransaction>,
    private readonly stellarService: StellarService,
  ) {
    super();
  }

  async process(job: Job<ReconcilePayoutJobData>): Promise<unknown> {
    if (job.name !== JOB_NAMES.RECONCILE_PAYOUT) {
      throw new Error(`Unknown payout reconciliation job: ${job.name}`);
    }

    const transaction = await this.payoutTransactionRepository.findOne({
      where: { id: job.data.payoutTransactionId },
    });

    if (!transaction) {
      this.logger.warn(
        `Payout transaction ${job.data.payoutTransactionId} not found; skipping`,
      );
      return { status: 'SKIPPED' };
    }

    if (
      transaction.status !== PayoutTransactionStatus.SUBMITTED &&
      !(
        transaction.status === PayoutTransactionStatus.PENDING_SUBMISSION &&
        transaction.txHash
      )
    ) {
      return { status: 'NOOP', payoutStatus: transaction.status };
    }

    if (!transaction.txHash) {
      throw new Error(
        `Payout transaction ${transaction.id} is ${transaction.status} but has no txHash`,
      );
    }

    const chainStatus = await this.stellarService.getTransactionStatus(
      transaction.txHash,
    );

    if (chainStatus === 'CONFIRMED') {
      transaction.status = PayoutTransactionStatus.CONFIRMED;
      await this.payoutTransactionRepository.save(transaction);
      return { status: 'CONFIRMED' };
    }

    if (chainStatus === 'FAILED') {
      transaction.status = PayoutTransactionStatus.FAILED;
      await this.payoutTransactionRepository.save(transaction);
      return { status: 'FAILED' };
    }

    throw new Error(
      `Transaction ${transaction.txHash} is still pending on-chain and will be retried`,
    );
  }
}
