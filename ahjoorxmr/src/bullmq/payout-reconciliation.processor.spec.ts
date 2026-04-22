import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Job } from 'bullmq';
import { PayoutReconciliationProcessor } from './payout-reconciliation.processor';
import { PayoutTransaction } from '../groups/entities/payout-transaction.entity';
import { PayoutTransactionStatus } from '../groups/entities/payout-transaction-status.enum';
import { StellarService } from '../stellar/stellar.service';
import { JOB_NAMES } from './queue.constants';

type FnMock = ReturnType<typeof jest.fn>;

describe('PayoutReconciliationProcessor', () => {
  let processor: PayoutReconciliationProcessor;
  let payoutRepo: { findOne: FnMock; save: FnMock };
  let stellarService: { getTransactionStatus: FnMock };

  const makeJob = (id: string): Job<{ payoutTransactionId: string }> =>
    ({
      id: 'job-1',
      name: JOB_NAMES.RECONCILE_PAYOUT,
      data: { payoutTransactionId: id },
    }) as unknown as Job<{ payoutTransactionId: string }>;

  beforeEach(async () => {
    payoutRepo = { findOne: jest.fn(), save: jest.fn() };
    stellarService = { getTransactionStatus: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutReconciliationProcessor,
        {
          provide: getRepositoryToken(PayoutTransaction),
          useValue: payoutRepo,
        },
        { provide: StellarService, useValue: stellarService },
      ],
    }).compile();

    processor = module.get(PayoutReconciliationProcessor);
  });

  it('marks transaction as CONFIRMED when chain confirms', async () => {
    payoutRepo.findOne.mockResolvedValue({
      id: 'ptx-1',
      txHash: 'hash-1',
      status: PayoutTransactionStatus.SUBMITTED,
    });
    stellarService.getTransactionStatus.mockResolvedValue('CONFIRMED');

    const result = await processor.process(makeJob('ptx-1'));

    expect(result).toEqual({ status: 'CONFIRMED' });
    expect(payoutRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PayoutTransactionStatus.CONFIRMED }),
    );
  });

  it('marks transaction as FAILED when chain fails', async () => {
    payoutRepo.findOne.mockResolvedValue({
      id: 'ptx-2',
      txHash: 'hash-2',
      status: PayoutTransactionStatus.SUBMITTED,
    });
    stellarService.getTransactionStatus.mockResolvedValue('FAILED');

    const result = await processor.process(makeJob('ptx-2'));

    expect(result).toEqual({ status: 'FAILED' });
    expect(payoutRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PayoutTransactionStatus.FAILED }),
    );
  });
});
