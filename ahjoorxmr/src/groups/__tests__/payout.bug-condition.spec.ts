/**
 * Bug Condition Exploration Test — Stellar Payout Idempotency
 *
 * **Validates: Requirements 1.1, 1.2**
 *
 * CRITICAL: This test MUST FAIL on unfixed code — failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 *
 * Property 1: Fault Condition — Write-Ahead Record Before Broadcast
 *
 * For any input where the bug condition holds (no existing payout_transactions row,
 * group ACTIVE, membership valid), distributePayout SHALL persist a PENDING_SUBMISSION
 * row to the database BEFORE server.sendTransaction() is invoked.
 *
 * Bug condition (isBugCondition = true):
 *   - No existing payout_transactions row for payoutOrderId
 *   - group.status = ACTIVE
 *   - membership.hasReceivedPayout = false
 *   - membership exists for (groupId, round - 1)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PayoutService } from '../payout.service';
import { Group } from '../entities/group.entity';
import { Membership } from '../../memberships/entities/membership.entity';
import { StellarService } from '../../stellar/stellar.service';
import { NotificationsService } from '../../notification/notifications.service';
import { PayoutTransaction } from '../entities/payout-transaction.entity';
import { PayoutTransactionStatus } from '../entities/payout-transaction-status.enum';
import { QueueService } from '../../bullmq/queue.service';
import { ConfigService } from '@nestjs/config';
import { GroupStatus } from '../entities/group-status.enum';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'group-1',
    status: GroupStatus.ACTIVE,
    contractAddress: 'CCONTRACT123',
    contributionAmount: '100',
    name: 'Test Group',
    ...overrides,
  } as Group;
}

function makeMembership(overrides: Partial<Membership> = {}): Membership {
  return {
    userId: 'user-1',
    walletAddress: 'GWALLET456',
    payoutOrder: 0,
    hasReceivedPayout: false,
    groupId: 'group-1',
    ...overrides,
  } as Membership;
}

function makePayoutTransaction(
  overrides: Partial<PayoutTransaction> = {},
): PayoutTransaction {
  return {
    id: 'ptx-1',
    payoutOrderId: 'group-1:1',
    status: PayoutTransactionStatus.PENDING_SUBMISSION,
    txHash: null,
    ...overrides,
  } as PayoutTransaction;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('PayoutService — Bug Condition Exploration (Property 1: Write-Ahead Record Before Broadcast)', () => {
  let service: PayoutService;
  let groupRepo: { findOne: jest.Mock };
  let membershipRepo: { findOne: jest.Mock; save: jest.Mock };
  let payoutTransactionRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };
  let stellarService: { disbursePayout: jest.Mock };
  let notificationsService: { notify: jest.Mock };
  let queueService: { addPayoutReconciliation: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    groupRepo = { findOne: jest.fn() };
    membershipRepo = { findOne: jest.fn(), save: jest.fn() };
    payoutTransactionRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
    };
    stellarService = { disbursePayout: jest.fn() };
    notificationsService = { notify: jest.fn().mockResolvedValue(undefined) };
    queueService = {
      addPayoutReconciliation: jest.fn().mockResolvedValue(undefined),
    };
    configService = { get: jest.fn(() => 'false') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutService,
        { provide: getRepositoryToken(Group), useValue: groupRepo },
        { provide: getRepositoryToken(Membership), useValue: membershipRepo },
        {
          provide: getRepositoryToken(PayoutTransaction),
          useValue: payoutTransactionRepo,
        },
        { provide: StellarService, useValue: stellarService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: QueueService, useValue: queueService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(PayoutService);
  });

  // -------------------------------------------------------------------------
  // Test Case 1: Write-ahead order
  //
  // Assert that payoutTransactionRepository.save with PENDING_SUBMISSION is
  // called BEFORE stellarService.disbursePayout is invoked.
  //
  // On unfixed code this will FAIL if disbursePayout is called before the save.
  // -------------------------------------------------------------------------
  it('TC1 — save(PENDING_SUBMISSION) is called BEFORE disbursePayout (write-ahead order)', async () => {
    const callOrder: string[] = [];

    const ptx = makePayoutTransaction();
    groupRepo.findOne.mockResolvedValue(makeGroup());
    membershipRepo.findOne.mockResolvedValue(makeMembership());
    payoutTransactionRepo.findOne.mockResolvedValue(null); // no existing row — bug condition
    payoutTransactionRepo.create.mockReturnValue(ptx);

    // Spy on save to record call order
    payoutTransactionRepo.save.mockImplementation(async (entity: PayoutTransaction) => {
      if (entity.status === PayoutTransactionStatus.PENDING_SUBMISSION && entity.txHash === null) {
        callOrder.push('save:PENDING_SUBMISSION');
      }
      return entity;
    });

    // Spy on disbursePayout to record call order
    stellarService.disbursePayout.mockImplementation(
      async (
        _contract: string,
        _recipient: string,
        _amount: string,
        onBeforeSubmit?: (hash: string) => Promise<void>,
      ) => {
        callOrder.push('disbursePayout:called');
        if (onBeforeSubmit) {
          await onBeforeSubmit('TX_HASH_001');
        }
        return 'TX_HASH_001';
      },
    );

    membershipRepo.save.mockResolvedValue({});

    await service.distributePayout('group-1', 1);

    // ASSERTION: save(PENDING_SUBMISSION) must appear before disbursePayout in the call log
    const saveIndex = callOrder.indexOf('save:PENDING_SUBMISSION');
    const disburseIndex = callOrder.indexOf('disbursePayout:called');

    expect(saveIndex).toBeGreaterThanOrEqual(0); // save must have been called
    expect(disburseIndex).toBeGreaterThanOrEqual(0); // disbursePayout must have been called
    expect(saveIndex).toBeLessThan(disburseIndex); // save BEFORE disburse
  });

  // -------------------------------------------------------------------------
  // Test Case 2: Crash simulation — txHash persisted before sendTransaction
  //
  // Make disbursePayout throw AFTER onBeforeSubmit fires.
  // Assert the row has PENDING_SUBMISSION status and a non-null txHash.
  //
  // On unfixed code this will FAIL if onBeforeSubmit is never called or the
  // txHash is not persisted before the crash.
  // -------------------------------------------------------------------------
  it('TC2 — after crash (disbursePayout throws post-onBeforeSubmit), row has PENDING_SUBMISSION + non-null txHash', async () => {
    const CRASH_HASH = 'CRASH_TX_HASH_002';
    const ptx = makePayoutTransaction();

    groupRepo.findOne.mockResolvedValue(makeGroup());
    membershipRepo.findOne.mockResolvedValue(makeMembership());
    payoutTransactionRepo.findOne.mockResolvedValue(null); // no existing row — bug condition
    payoutTransactionRepo.create.mockReturnValue(ptx);

    // Track what was saved
    const savedStates: Array<{ status: PayoutTransactionStatus; txHash: string | null }> = [];
    payoutTransactionRepo.save.mockImplementation(async (entity: PayoutTransaction) => {
      savedStates.push({ status: entity.status, txHash: entity.txHash });
      return entity;
    });

    // disbursePayout fires onBeforeSubmit (persisting the hash) then throws to simulate crash
    stellarService.disbursePayout.mockImplementation(
      async (
        _contract: string,
        _recipient: string,
        _amount: string,
        onBeforeSubmit?: (hash: string) => Promise<void>,
      ) => {
        if (onBeforeSubmit) {
          await onBeforeSubmit(CRASH_HASH); // hash persisted before crash
        }
        throw new Error('Simulated crash after onBeforeSubmit');
      },
    );

    // distributePayout should throw (crash)
    await expect(service.distributePayout('group-1', 1)).rejects.toThrow();

    // ASSERTION: a save with PENDING_SUBMISSION and the non-null txHash must have occurred
    const pendingWithHash = savedStates.find(
      (s) =>
        s.status === PayoutTransactionStatus.PENDING_SUBMISSION &&
        s.txHash === CRASH_HASH,
    );

    expect(pendingWithHash).toBeDefined(); // must have saved PENDING_SUBMISSION + txHash before crash
  });

  // -------------------------------------------------------------------------
  // Test Case 3: Duplicate broadcast prevention (idempotency)
  //
  // Call distributePayout twice for the same payoutOrderId with no existing
  // row on the first call. Assert disbursePayout is called exactly once.
  //
  // On unfixed code this will FAIL if the second call also triggers a broadcast.
  // -------------------------------------------------------------------------
  it('TC3 — calling distributePayout twice for same payoutOrderId triggers disbursePayout exactly once', async () => {
    const TX_HASH = 'TX_HASH_003';
    const ptx = makePayoutTransaction();

    groupRepo.findOne.mockResolvedValue(makeGroup());

    // Return a fresh membership object on each call so the first call's mutation
    // (hasReceivedPayout = true) doesn't bleed into the second call.
    // The idempotency guard on payoutTransactionRepo should short-circuit the
    // second call before it even reaches the membership check — if idempotency
    // is broken, the second call will reach disbursePayout and the assertion catches it.
    membershipRepo.findOne.mockImplementation(async () =>
      makeMembership({ hasReceivedPayout: false }),
    );

    // First call: no existing row (bug condition)
    // Second call: row exists — idempotency should kick in and skip disbursePayout
    let ptxFindCallCount = 0;
    payoutTransactionRepo.findOne.mockImplementation(async () => {
      ptxFindCallCount++;
      if (ptxFindCallCount === 1) {
        return null; // first call — no row, bug condition
      }
      // second call — row already exists, idempotency guard should return early
      return makePayoutTransaction({
        status: PayoutTransactionStatus.SUBMITTED,
        txHash: TX_HASH,
      });
    });

    payoutTransactionRepo.create.mockReturnValue(ptx);
    payoutTransactionRepo.save.mockImplementation(async (entity: PayoutTransaction) => entity);
    membershipRepo.save.mockResolvedValue({});

    stellarService.disbursePayout.mockImplementation(
      async (
        _contract: string,
        _recipient: string,
        _amount: string,
        onBeforeSubmit?: (hash: string) => Promise<void>,
      ) => {
        if (onBeforeSubmit) {
          await onBeforeSubmit(TX_HASH);
        }
        return TX_HASH;
      },
    );

    // First call — should broadcast
    await service.distributePayout('group-1', 1);
    // Second call for the same payoutOrderId — should NOT broadcast
    await service.distributePayout('group-1', 1);

    // ASSERTION: disbursePayout must have been called exactly once
    expect(stellarService.disbursePayout).toHaveBeenCalledTimes(1);
  });
});
