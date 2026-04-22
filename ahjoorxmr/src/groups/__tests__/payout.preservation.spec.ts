/**
 * Preservation Property Tests — Stellar Payout Idempotency
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
 *
 * These tests MUST PASS on UNFIXED code — they establish the baseline
 * behavior that the fix must preserve.
 *
 * Property 2: Preservation — Idempotency for Existing Records and Precondition Guards
 *
 * For all inputs where `isBugCondition` returns false (existing payout_transactions
 * row, or precondition failure), `distributePayout` must produce the same result
 * before and after the fix.
 *
 * Covered scenarios:
 *   P2a — membership.hasReceivedPayout = true → ConflictException (req 3.2)
 *   P2b — group does not exist → NotFoundException (req 3.3)
 *   P2c — group status not ACTIVE → BadRequestException (req 3.4)
 *   P2d — SUBMITTED row exists → no disbursePayout call, reconciliation re-enqueued (req 3.6)
 *   P2e — disbursePayout throws with no prior hash → row FAILED, BadGatewayException (req 3.5)
 *   P2f — any existing payout_transactions record → disbursePayout never called (req 2.2)
 *
 * EXPECTED OUTCOME: All tests PASS (confirms baseline behavior to preserve)
 */

import * as fc from 'fast-check';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  BadGatewayException,
} from '@nestjs/common';
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
    id: 'ptx-existing',
    payoutOrderId: 'group-1:1',
    status: PayoutTransactionStatus.SUBMITTED,
    txHash: 'EXISTING_TX_HASH',
    ...overrides,
  } as PayoutTransaction;
}

/** Build a fresh NestJS testing module with injectable mocks */
async function buildModule() {
  const groupRepo = { findOne: jest.fn() };
  const membershipRepo = { findOne: jest.fn(), save: jest.fn() };
  const payoutTransactionRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };
  const stellarService = { disbursePayout: jest.fn() };
  const notificationsService = { notify: jest.fn().mockResolvedValue(undefined) };
  const queueService = { addPayoutReconciliation: jest.fn().mockResolvedValue(undefined) };
  const configService = { get: jest.fn(() => 'false') };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PayoutService,
      { provide: getRepositoryToken(Group), useValue: groupRepo },
      { provide: getRepositoryToken(Membership), useValue: membershipRepo },
      { provide: getRepositoryToken(PayoutTransaction), useValue: payoutTransactionRepo },
      { provide: StellarService, useValue: stellarService },
      { provide: NotificationsService, useValue: notificationsService },
      { provide: QueueService, useValue: queueService },
      { provide: ConfigService, useValue: configService },
    ],
  }).compile();

  return {
    service: module.get<PayoutService>(PayoutService),
    groupRepo,
    membershipRepo,
    payoutTransactionRepo,
    stellarService,
    queueService,
  };
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('PayoutService — Preservation (Property 2: Idempotency for Existing Records and Precondition Guards)', () => {
  afterEach(() => jest.clearAllMocks());

  // ── P2a: ConflictException when member already received payout (req 3.2) ──

  it('P2a: throws ConflictException when membership.hasReceivedPayout = true', async () => {
    const { service, groupRepo, membershipRepo } = await buildModule();

    groupRepo.findOne.mockResolvedValue(makeGroup());
    membershipRepo.findOne.mockResolvedValue(makeMembership({ hasReceivedPayout: true }));

    await expect(service.distributePayout('group-1', 1)).rejects.toThrow(ConflictException);
  });

  it('P2a PBT: ConflictException for any groupId/round when hasReceivedPayout = true', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 1, max: 100 }),
        async (groupId, round) => {
          const { service, groupRepo, membershipRepo } = await buildModule();

          groupRepo.findOne.mockResolvedValue(makeGroup({ id: groupId }));
          membershipRepo.findOne.mockResolvedValue(
            makeMembership({ groupId, payoutOrder: round - 1, hasReceivedPayout: true }),
          );

          await expect(service.distributePayout(groupId, round)).rejects.toThrow(
            ConflictException,
          );
        },
      ),
      { numRuns: 20 },
    );
  });

  // ── P2b: NotFoundException when group does not exist (req 3.3) ────────────

  it('P2b: throws NotFoundException when group does not exist', async () => {
    const { service, groupRepo } = await buildModule();

    groupRepo.findOne.mockResolvedValue(null);

    await expect(service.distributePayout('nonexistent-group', 1)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('P2b PBT: NotFoundException for any groupId/round when group is missing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 1, max: 100 }),
        async (groupId, round) => {
          const { service, groupRepo } = await buildModule();

          groupRepo.findOne.mockResolvedValue(null);

          await expect(service.distributePayout(groupId, round)).rejects.toThrow(
            NotFoundException,
          );
        },
      ),
      { numRuns: 20 },
    );
  });

  // ── P2c: BadRequestException when group status is not ACTIVE (req 3.4) ───

  it('P2c: throws BadRequestException when group status is PENDING', async () => {
    const { service, groupRepo } = await buildModule();

    groupRepo.findOne.mockResolvedValue(makeGroup({ status: GroupStatus.PENDING }));

    await expect(service.distributePayout('group-1', 1)).rejects.toThrow(BadRequestException);
  });

  it('P2c: throws BadRequestException when group status is COMPLETED', async () => {
    const { service, groupRepo } = await buildModule();

    groupRepo.findOne.mockResolvedValue(makeGroup({ status: GroupStatus.COMPLETED }));

    await expect(service.distributePayout('group-1', 1)).rejects.toThrow(BadRequestException);
  });

  it('P2c PBT: BadRequestException for any non-ACTIVE group status', async () => {
    const nonActiveStatuses = [GroupStatus.PENDING, GroupStatus.COMPLETED];

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 1, max: 100 }),
        fc.constantFrom(...nonActiveStatuses),
        async (groupId, round, status) => {
          const { service, groupRepo } = await buildModule();

          groupRepo.findOne.mockResolvedValue(makeGroup({ id: groupId, status }));

          await expect(service.distributePayout(groupId, round)).rejects.toThrow(
            BadRequestException,
          );
        },
      ),
      { numRuns: 20 },
    );
  });

  // ── P2d: SUBMITTED row → no disbursePayout, reconciliation re-enqueued (req 3.6) ──

  it('P2d: when SUBMITTED row exists, disbursePayout is NOT called and reconciliation job is re-enqueued', async () => {
    const { service, groupRepo, membershipRepo, payoutTransactionRepo, stellarService, queueService } =
      await buildModule();

    const existingTx = makePayoutTransaction({
      status: PayoutTransactionStatus.SUBMITTED,
      txHash: 'SUBMITTED_HASH',
    });

    groupRepo.findOne.mockResolvedValue(makeGroup());
    membershipRepo.findOne.mockResolvedValue(makeMembership());
    payoutTransactionRepo.findOne.mockResolvedValue(existingTx);

    const result = await service.distributePayout('group-1', 1);

    expect(stellarService.disbursePayout).not.toHaveBeenCalled();
    expect(queueService.addPayoutReconciliation).toHaveBeenCalledWith({
      payoutTransactionId: existingTx.id,
    });
    expect(result).toBe('SUBMITTED_HASH');
  });

  it('P2d PBT: for any SUBMITTED row, disbursePayout is never called and reconciliation is re-enqueued', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 1, max: 100 }),
        fc.uuid(), // random txHash
        fc.uuid(), // random payoutTransactionId
        async (groupId, round, txHash, ptxId) => {
          const { service, groupRepo, membershipRepo, payoutTransactionRepo, stellarService, queueService } =
            await buildModule();

          const existingTx = makePayoutTransaction({
            id: ptxId,
            payoutOrderId: `${groupId}:${round}`,
            status: PayoutTransactionStatus.SUBMITTED,
            txHash,
          });

          groupRepo.findOne.mockResolvedValue(makeGroup({ id: groupId }));
          membershipRepo.findOne.mockResolvedValue(
            makeMembership({ groupId, payoutOrder: round - 1 }),
          );
          payoutTransactionRepo.findOne.mockResolvedValue(existingTx);

          const result = await service.distributePayout(groupId, round);

          expect(stellarService.disbursePayout).not.toHaveBeenCalled();
          expect(queueService.addPayoutReconciliation).toHaveBeenCalledWith({
            payoutTransactionId: ptxId,
          });
          expect(result).toBe(txHash);
        },
      ),
      { numRuns: 20 },
    );
  });

  // ── P2e: disbursePayout throws with no prior hash → FAILED row + BadGatewayException (req 3.5) ──

  it('P2e: when disbursePayout throws with no prior txHash, row is marked FAILED and BadGatewayException is thrown', async () => {
    const { service, groupRepo, membershipRepo, payoutTransactionRepo, stellarService } =
      await buildModule();

    const ptx = makePayoutTransaction({
      id: 'ptx-fail',
      status: PayoutTransactionStatus.PENDING_SUBMISSION,
      txHash: null,
    });

    groupRepo.findOne.mockResolvedValue(makeGroup());
    membershipRepo.findOne.mockResolvedValue(makeMembership());
    payoutTransactionRepo.findOne.mockResolvedValue(null);
    payoutTransactionRepo.create.mockReturnValue(ptx);
    payoutTransactionRepo.save.mockImplementation(async (entity: PayoutTransaction) => entity);

    // disbursePayout throws immediately — no onBeforeSubmit called, no txHash set
    stellarService.disbursePayout.mockRejectedValue(new Error('Stellar RPC error'));

    await expect(service.distributePayout('group-1', 1)).rejects.toThrow(BadGatewayException);

    // The row must have been saved with FAILED status
    expect(payoutTransactionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PayoutTransactionStatus.FAILED }),
    );
  });

  it('P2e PBT: for any RPC failure with no prior hash, row is FAILED and BadGatewayException is thrown', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 1, max: 100 }),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (groupId, round, errorMessage) => {
          const { service, groupRepo, membershipRepo, payoutTransactionRepo, stellarService } =
            await buildModule();

          const ptx = makePayoutTransaction({
            id: 'ptx-fail',
            payoutOrderId: `${groupId}:${round}`,
            status: PayoutTransactionStatus.PENDING_SUBMISSION,
            txHash: null,
          });

          groupRepo.findOne.mockResolvedValue(makeGroup({ id: groupId }));
          membershipRepo.findOne.mockResolvedValue(
            makeMembership({ groupId, payoutOrder: round - 1 }),
          );
          payoutTransactionRepo.findOne.mockResolvedValue(null);
          payoutTransactionRepo.create.mockReturnValue(ptx);
          payoutTransactionRepo.save.mockImplementation(async (entity: PayoutTransaction) => entity);

          // Throw without calling onBeforeSubmit — txHash stays null
          stellarService.disbursePayout.mockRejectedValue(new Error(errorMessage));

          await expect(service.distributePayout(groupId, round)).rejects.toThrow(
            BadGatewayException,
          );

          expect(payoutTransactionRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({ status: PayoutTransactionStatus.FAILED }),
          );
        },
      ),
      { numRuns: 20 },
    );
  });

  // ── P2f: any existing payout_transactions record → disbursePayout never called (req 2.2) ──

  it('P2f: disbursePayout is never called when any existing payout_transactions record exists', async () => {
    const allStatuses = [
      PayoutTransactionStatus.PENDING_SUBMISSION,
      PayoutTransactionStatus.SUBMITTED,
      PayoutTransactionStatus.CONFIRMED,
      PayoutTransactionStatus.FAILED,
    ];

    for (const status of allStatuses) {
      const { service, groupRepo, membershipRepo, payoutTransactionRepo, stellarService } =
        await buildModule();

      const existingTx = makePayoutTransaction({ status, txHash: status === PayoutTransactionStatus.PENDING_SUBMISSION ? null : 'SOME_HASH' });

      groupRepo.findOne.mockResolvedValue(makeGroup());
      membershipRepo.findOne.mockResolvedValue(makeMembership());
      payoutTransactionRepo.findOne.mockResolvedValue(existingTx);

      await service.distributePayout('group-1', 1);

      expect(stellarService.disbursePayout).not.toHaveBeenCalled();
    }
  });

  it('P2f PBT: for any existing payout_transactions record (any status), disbursePayout is never called', async () => {
    const allStatuses = [
      PayoutTransactionStatus.PENDING_SUBMISSION,
      PayoutTransactionStatus.SUBMITTED,
      PayoutTransactionStatus.CONFIRMED,
      PayoutTransactionStatus.FAILED,
    ];

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.integer({ min: 1, max: 100 }),
        fc.constantFrom(...allStatuses),
        fc.option(fc.uuid(), { nil: null }),
        async (groupId, round, status, txHash) => {
          const { service, groupRepo, membershipRepo, payoutTransactionRepo, stellarService } =
            await buildModule();

          const existingTx = makePayoutTransaction({
            payoutOrderId: `${groupId}:${round}`,
            status,
            txHash,
          });

          groupRepo.findOne.mockResolvedValue(makeGroup({ id: groupId }));
          membershipRepo.findOne.mockResolvedValue(
            makeMembership({ groupId, payoutOrder: round - 1 }),
          );
          payoutTransactionRepo.findOne.mockResolvedValue(existingTx);

          await service.distributePayout(groupId, round);

          expect(stellarService.disbursePayout).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 30 },
    );
  });

  // ── P2g: precondition guards fire before any DB write or RPC call ─────────

  it('P2g: no payoutTransactionRepo.save or disbursePayout called when group is missing', async () => {
    const { service, groupRepo, payoutTransactionRepo, stellarService } = await buildModule();

    groupRepo.findOne.mockResolvedValue(null);

    await expect(service.distributePayout('group-1', 1)).rejects.toThrow(NotFoundException);

    expect(payoutTransactionRepo.save).not.toHaveBeenCalled();
    expect(stellarService.disbursePayout).not.toHaveBeenCalled();
  });

  it('P2g: no payoutTransactionRepo.save or disbursePayout called when group is not ACTIVE', async () => {
    const { service, groupRepo, payoutTransactionRepo, stellarService } = await buildModule();

    groupRepo.findOne.mockResolvedValue(makeGroup({ status: GroupStatus.PENDING }));

    await expect(service.distributePayout('group-1', 1)).rejects.toThrow(BadRequestException);

    expect(payoutTransactionRepo.save).not.toHaveBeenCalled();
    expect(stellarService.disbursePayout).not.toHaveBeenCalled();
  });

  it('P2g: no payoutTransactionRepo.save or disbursePayout called when member already received payout', async () => {
    const { service, groupRepo, membershipRepo, payoutTransactionRepo, stellarService } =
      await buildModule();

    groupRepo.findOne.mockResolvedValue(makeGroup());
    membershipRepo.findOne.mockResolvedValue(makeMembership({ hasReceivedPayout: true }));

    await expect(service.distributePayout('group-1', 1)).rejects.toThrow(ConflictException);

    expect(payoutTransactionRepo.save).not.toHaveBeenCalled();
    expect(stellarService.disbursePayout).not.toHaveBeenCalled();
  });
});
