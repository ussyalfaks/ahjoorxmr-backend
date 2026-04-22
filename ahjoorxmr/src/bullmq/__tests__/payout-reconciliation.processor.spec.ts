import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Job } from 'bullmq';
import { PayoutReconciliationProcessor } from '../payout-reconciliation.processor';
import { PayoutTransaction } from '../../groups/entities/payout-transaction.entity';
import { PayoutTransactionStatus } from '../../groups/entities/payout-transaction-status.enum';
import { StellarService } from '../../stellar/stellar.service';
import { JOB_NAMES } from '../queue.constants';

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
      attemptsMade: 0,
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

  // -------------------------------------------------------------------------
  // SUBMITTED status tests
  // -------------------------------------------------------------------------

  it('SUBMITTED + txHash → polls Stellar RPC → transitions to CONFIRMED', async () => {
    payoutRepo.findOne.mockResolvedValue({
      id: 'ptx-1',
      txHash: 'hash-submitted-1',
      status: PayoutTransactionStatus.SUBMITTED,
    });
    stellarService.getTransactionStatus.mockResolvedValue('CONFIRMED');

    const result = await processor.process(makeJob('ptx-1'));

    expect(stellarService.getTransactionStatus).toHaveBeenCalledWith('hash-submitted-1');
    expect(result).toEqual({ status: 'CONFIRMED' });
    expect(payoutRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PayoutTransactionStatus.CONFIRMED }),
    );
  });

  it('SUBMITTED + txHash → polls Stellar RPC → transitions to FAILED', async () => {
    payoutRepo.findOne.mockResolvedValue({
      id: 'ptx-2',
      txHash: 'hash-submitted-2',
      status: PayoutTransactionStatus.SUBMITTED,
    });
    stellarService.getTransactionStatus.mockResolvedValue('FAILED');

    const result = await processor.process(makeJob('ptx-2'));

    expect(stellarService.getTransactionStatus).toHaveBeenCalledWith('hash-submitted-2');
    expect(result).toEqual({ status: 'FAILED' });
    expect(payoutRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PayoutTransactionStatus.FAILED }),
    );
  });

  // -------------------------------------------------------------------------
  // PENDING_SUBMISSION + non-null txHash tests (Requirements 2.5, 2.6, 2.7)
  // -------------------------------------------------------------------------

  it('PENDING_SUBMISSION + non-null txHash → polls Stellar RPC → transitions to CONFIRMED', async () => {
    // This covers the crash-recovery path: process crashed after onBeforeSubmit stored
    // the txHash but before the status was updated to SUBMITTED.
    payoutRepo.findOne.mockResolvedValue({
      id: 'ptx-3',
      txHash: 'hash-pending-1',
      status: PayoutTransactionStatus.PENDING_SUBMISSION,
    });
    stellarService.getTransactionStatus.mockResolvedValue('CONFIRMED');

    const result = await processor.process(makeJob('ptx-3'));

    expect(stellarService.getTransactionStatus).toHaveBeenCalledWith('hash-pending-1');
    expect(result).toEqual({ status: 'CONFIRMED' });
    expect(payoutRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PayoutTransactionStatus.CONFIRMED }),
    );
  });

  it('PENDING_SUBMISSION + non-null txHash → polls Stellar RPC → transitions to FAILED', async () => {
    payoutRepo.findOne.mockResolvedValue({
      id: 'ptx-4',
      txHash: 'hash-pending-2',
      status: PayoutTransactionStatus.PENDING_SUBMISSION,
    });
    stellarService.getTransactionStatus.mockResolvedValue('FAILED');

    const result = await processor.process(makeJob('ptx-4'));

    expect(stellarService.getTransactionStatus).toHaveBeenCalledWith('hash-pending-2');
    expect(result).toEqual({ status: 'FAILED' });
    expect(payoutRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PayoutTransactionStatus.FAILED }),
    );
  });

  it('PENDING_SUBMISSION + null txHash → skips Stellar poll (no hash to check)', async () => {
    // A PENDING_SUBMISSION row with no txHash means the broadcast never happened;
    // the processor should return NOOP rather than throw or poll.
    payoutRepo.findOne.mockResolvedValue({
      id: 'ptx-5',
      txHash: null,
      status: PayoutTransactionStatus.PENDING_SUBMISSION,
    });

    const result = await processor.process(makeJob('ptx-5'));

    expect(stellarService.getTransactionStatus).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'NOOP', payoutStatus: PayoutTransactionStatus.PENDING_SUBMISSION });
  });

  // -------------------------------------------------------------------------
  // Exponential back-off behavior (max 5 retries)
  // -------------------------------------------------------------------------

  it('throws when chain status is PENDING so BullMQ retries with exponential back-off', async () => {
    // When the on-chain status is still PENDING, the processor throws an error.
    // BullMQ will catch this and schedule a retry with exponential back-off.
    // The queue is configured with attempts: 5 and backoff: { type: 'exponential', delay: 5000 }.
    payoutRepo.findOne.mockResolvedValue({
      id: 'ptx-6',
      txHash: 'hash-pending-chain',
      status: PayoutTransactionStatus.SUBMITTED,
    });
    stellarService.getTransactionStatus.mockResolvedValue('PENDING');

    await expect(processor.process(makeJob('ptx-6'))).rejects.toThrow(
      'still pending on-chain and will be retried',
    );

    // No status update should be persisted while still pending
    expect(payoutRepo.save).not.toHaveBeenCalled();
  });

  it('throws when chain status is PENDING for PENDING_SUBMISSION + txHash row (triggers retry)', async () => {
    payoutRepo.findOne.mockResolvedValue({
      id: 'ptx-7',
      txHash: 'hash-pending-chain-2',
      status: PayoutTransactionStatus.PENDING_SUBMISSION,
    });
    stellarService.getTransactionStatus.mockResolvedValue('PENDING');

    await expect(processor.process(makeJob('ptx-7'))).rejects.toThrow(
      'still pending on-chain and will be retried',
    );

    expect(payoutRepo.save).not.toHaveBeenCalled();
  });

  it('retries up to 5 times before giving up (back-off simulation)', async () => {
    // Simulate 4 PENDING responses followed by a CONFIRMED on the 5th attempt.
    // Each call to process() represents one BullMQ attempt.
    const transaction = {
      id: 'ptx-8',
      txHash: 'hash-retry',
      status: PayoutTransactionStatus.SUBMITTED,
    };
    payoutRepo.findOne.mockResolvedValue(transaction);

    // Attempts 1-4: still PENDING → processor throws → BullMQ retries
    for (let attempt = 1; attempt <= 4; attempt++) {
      stellarService.getTransactionStatus.mockResolvedValueOnce('PENDING');
      await expect(processor.process(makeJob('ptx-8'))).rejects.toThrow(
        'still pending on-chain and will be retried',
      );
    }

    // Attempt 5: CONFIRMED → processor resolves
    stellarService.getTransactionStatus.mockResolvedValueOnce('CONFIRMED');
    const result = await processor.process(makeJob('ptx-8'));

    expect(result).toEqual({ status: 'CONFIRMED' });
    expect(stellarService.getTransactionStatus).toHaveBeenCalledTimes(5);
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  it('returns SKIPPED when transaction is not found', async () => {
    payoutRepo.findOne.mockResolvedValue(null);

    const result = await processor.process(makeJob('ptx-missing'));

    expect(result).toEqual({ status: 'SKIPPED' });
    expect(stellarService.getTransactionStatus).not.toHaveBeenCalled();
  });

  it('returns NOOP for CONFIRMED transactions (already terminal)', async () => {
    payoutRepo.findOne.mockResolvedValue({
      id: 'ptx-9',
      txHash: 'hash-confirmed',
      status: PayoutTransactionStatus.CONFIRMED,
    });

    const result = await processor.process(makeJob('ptx-9'));

    expect(result).toEqual({ status: 'NOOP', payoutStatus: PayoutTransactionStatus.CONFIRMED });
    expect(stellarService.getTransactionStatus).not.toHaveBeenCalled();
  });

  it('returns NOOP for FAILED transactions (already terminal)', async () => {
    payoutRepo.findOne.mockResolvedValue({
      id: 'ptx-10',
      txHash: 'hash-failed',
      status: PayoutTransactionStatus.FAILED,
    });

    const result = await processor.process(makeJob('ptx-10'));

    expect(result).toEqual({ status: 'NOOP', payoutStatus: PayoutTransactionStatus.FAILED });
    expect(stellarService.getTransactionStatus).not.toHaveBeenCalled();
  });

  it('throws for unknown job names', async () => {
    const badJob = {
      id: 'job-bad',
      name: 'unknown-job',
      data: { payoutTransactionId: 'ptx-11' },
    } as unknown as Job<{ payoutTransactionId: string }>;

    await expect(processor.process(badJob)).rejects.toThrow(
      'Unknown payout reconciliation job: unknown-job',
    );
  });
});
