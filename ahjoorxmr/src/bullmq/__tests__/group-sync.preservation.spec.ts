/**
 * Preservation Property Tests — Group Mediation Distributed Locking
 *
 * Property 2: Preservation — Solo and Different-Group Executions Unaffected
 *
 * These tests verify that the fix does NOT break existing behavior for inputs
 * where the bug condition does NOT hold (isBugCondition returns false):
 *   - Solo execution for any groupId
 *   - Concurrent executions for DIFFERENT groupIds
 *   - Lock TTL is read from MEDIATION_LOCK_TTL_MS env var
 *   - RedlockService API contract (acquire/release signatures) unchanged
 *   - handleSyncAllGroups batch dispatch unaffected
 *
 * Uses fast-check for property-based testing.
 *
 * EXPECTED OUTCOME: All tests PASS (confirms no regressions introduced by fix)
 */

import * as fc from 'fast-check';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { GroupSyncProcessor } from '../group-sync.processor';
import { DeadLetterService } from '../dead-letter.service';
import { StellarService } from '../../stellar/stellar.service';
import { Group } from '../../groups/entities/group.entity';
import { GroupStatus } from '../../groups/entities/group-status.enum';
import { JOB_NAMES, QUEUE_NAMES } from '../queue.constants';
import { RedlockService } from '../../common/redis/redlock.service';
import { ConfigService } from '@nestjs/config';

const makeJob = (data: unknown): Job =>
  ({
    id: 'preservation-job',
    name: JOB_NAMES.SYNC_GROUP_STATE,
    data,
    attemptsMade: 0,
    opts: { attempts: 3 },
  }) as unknown as Job;

const makeSyncAllJob = (data: unknown): Job =>
  ({
    id: 'sync-all-job',
    name: JOB_NAMES.SYNC_ALL_GROUPS,
    data,
    attemptsMade: 0,
    opts: { attempts: 3 },
  }) as unknown as Job;

/** Build a fresh NestJS testing module with injectable mocks */
async function buildModule(configGetFn: (key: string, def: string) => string) {
  const groupRepo = { findOne: jest.fn(), save: jest.fn(), find: jest.fn() };
  const mockLock = { release: jest.fn().mockResolvedValue(undefined) };
  const redlockService = {
    acquire: jest.fn().mockResolvedValue(mockLock),
    release: jest.fn().mockResolvedValue(undefined),
  };
  const stellarService = { getGroupState: jest.fn() };
  const groupSyncQueue = { addBulk: jest.fn().mockResolvedValue([]) };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      GroupSyncProcessor,
      { provide: DeadLetterService, useValue: { moveToDeadLetter: jest.fn() } },
      { provide: StellarService, useValue: stellarService },
      { provide: RedlockService, useValue: redlockService },
      {
        provide: ConfigService,
        useValue: { get: jest.fn(configGetFn) },
      },
      { provide: getRepositoryToken(Group), useValue: groupRepo },
      { provide: getQueueToken(QUEUE_NAMES.GROUP_SYNC), useValue: groupSyncQueue },
    ],
  }).compile();

  return {
    processor: module.get<GroupSyncProcessor>(GroupSyncProcessor),
    groupRepo,
    redlockService,
    stellarService,
    groupSyncQueue,
    mockLock,
  };
}

describe('Preservation: Solo and different-group executions unaffected by fix', () => {
  afterEach(() => jest.clearAllMocks());

  // ── Property 1: Solo execution always returns PROCESSED ──────────────────

  it('PBT: solo execution for any groupId returns PROCESSED and releases lock exactly once', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // random groupId
        async (groupId) => {
          const { processor, groupRepo, redlockService, stellarService, mockLock } =
            await buildModule((_key, def) => def);

          groupRepo.findOne.mockResolvedValue({
            id: groupId,
            contractAddress: '0xcontract',
            status: GroupStatus.ACTIVE,
            currentRound: 1,
            staleAt: null,
          });
          stellarService.getGroupState.mockResolvedValue({
            current_round: 1,
            status: 'ACTIVE',
          });

          const result = await processor.process(
            makeJob({ groupId, contractAddress: '0xcontract', chainId: 1 }),
          );

          expect(result).toEqual({ status: 'PROCESSED' });
          expect(redlockService.acquire).toHaveBeenCalledTimes(1);
          expect(redlockService.release).toHaveBeenCalledWith(mockLock);
          expect(redlockService.release).toHaveBeenCalledTimes(1);
        },
      ),
      { numRuns: 20 },
    );
  });

  // ── Property 2: Concurrent different-group executions don't interfere ────

  it('PBT: concurrent executions for distinct groupIds both return PROCESSED without interference', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(fc.uuid(), fc.uuid()).filter(([a, b]) => a !== b),
        async ([groupIdA, groupIdB]) => {
          // Each processor instance has its own independent lock state
          const moduleA = await buildModule((_key, def) => def);
          const moduleB = await buildModule((_key, def) => def);

          moduleA.groupRepo.findOne.mockResolvedValue({
            id: groupIdA,
            contractAddress: '0xcontractA',
            status: GroupStatus.ACTIVE,
            currentRound: 1,
            staleAt: null,
          });
          moduleA.stellarService.getGroupState.mockResolvedValue({
            current_round: 1,
            status: 'ACTIVE',
          });

          moduleB.groupRepo.findOne.mockResolvedValue({
            id: groupIdB,
            contractAddress: '0xcontractB',
            status: GroupStatus.ACTIVE,
            currentRound: 1,
            staleAt: null,
          });
          moduleB.stellarService.getGroupState.mockResolvedValue({
            current_round: 1,
            status: 'ACTIVE',
          });

          const [resultA, resultB] = await Promise.all([
            moduleA.processor.process(
              makeJob({ groupId: groupIdA, contractAddress: '0xcontractA', chainId: 1 }),
            ),
            moduleB.processor.process(
              makeJob({ groupId: groupIdB, contractAddress: '0xcontractB', chainId: 1 }),
            ),
          ]);

          // Both distinct groups must complete successfully
          expect(resultA).toEqual({ status: 'PROCESSED' });
          expect(resultB).toEqual({ status: 'PROCESSED' });

          // Lock keys are distinct — no interference
          expect(moduleA.redlockService.acquire).toHaveBeenCalledWith(
            `mediation:group:${groupIdA}`,
            expect.any(Number),
          );
          expect(moduleB.redlockService.acquire).toHaveBeenCalledWith(
            `mediation:group:${groupIdB}`,
            expect.any(Number),
          );
        },
      ),
      { numRuns: 15 },
    );
  });

  // ── Property 3: Lock TTL matches MEDIATION_LOCK_TTL_MS env var ───────────

  it('PBT: lock TTL passed to acquire matches MEDIATION_LOCK_TTL_MS config value', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1000, max: 120000 }), // random TTL in ms
        async (ttlMs) => {
          const { processor, groupRepo, redlockService, stellarService } =
            await buildModule((key, def) =>
              key === 'MEDIATION_LOCK_TTL_MS' ? String(ttlMs) : def,
            );

          groupRepo.findOne.mockResolvedValue({
            id: 'g1',
            contractAddress: '0xc1',
            status: GroupStatus.ACTIVE,
            currentRound: 1,
            staleAt: null,
          });
          stellarService.getGroupState.mockResolvedValue({
            current_round: 1,
            status: 'ACTIVE',
          });

          await processor.process(
            makeJob({ groupId: 'g1', contractAddress: '0xc1', chainId: 1 }),
          );

          expect(redlockService.acquire).toHaveBeenCalledWith(
            'mediation:group:g1',
            ttlMs,
          );
        },
      ),
      { numRuns: 20 },
    );
  });

  // ── Property 4: Lock key format is always mediation:group:{groupId} ──────

  it('PBT: lock key is always mediation:group:{groupId} for any groupId', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (groupId) => {
          const { processor, groupRepo, redlockService, stellarService } =
            await buildModule((_key, def) => def);

          groupRepo.findOne.mockResolvedValue({
            id: groupId,
            contractAddress: '0xc',
            status: GroupStatus.ACTIVE,
            currentRound: 1,
            staleAt: null,
          });
          stellarService.getGroupState.mockResolvedValue({
            current_round: 1,
            status: 'ACTIVE',
          });

          await processor.process(
            makeJob({ groupId, contractAddress: '0xc', chainId: 1 }),
          );

          expect(redlockService.acquire).toHaveBeenCalledWith(
            `mediation:group:${groupId}`,
            expect.any(Number),
          );
        },
      ),
      { numRuns: 20 },
    );
  });

  // ── Preservation: handleSyncAllGroups does not acquire mediation lock ─────

  it('handleSyncAllGroups dispatches batch jobs without acquiring mediation lock', async () => {
    const { processor, groupRepo, redlockService, groupSyncQueue } =
      await buildModule((_key, def) => def);

    groupRepo.find
      .mockResolvedValueOnce([
        { id: 'g1', contractAddress: '0xc1' },
        { id: 'g2', contractAddress: '0xc2' },
      ])
      .mockResolvedValueOnce([]); // second page empty

    await processor.process(
      makeSyncAllJob({ chainId: 1, batchSize: 50 }),
    );

    // Batch dispatch happened
    expect(groupSyncQueue.addBulk).toHaveBeenCalled();

    // No mediation lock acquired during batch dispatch
    expect(redlockService.acquire).not.toHaveBeenCalled();
  });

  // ── Preservation: error path still releases lock ─────────────────────────

  it('lock is released exactly once even when mediation body throws', async () => {
    const { processor, groupRepo, redlockService, stellarService, mockLock } =
      await buildModule((_key, def) => def);

    groupRepo.findOne.mockResolvedValue({
      id: 'g-err',
      contractAddress: '0xc',
      status: GroupStatus.ACTIVE,
      currentRound: 1,
      staleAt: null,
    });
    stellarService.getGroupState.mockRejectedValue(new Error('rpc error'));

    await expect(
      processor.process(makeJob({ groupId: 'g-err', contractAddress: '0xc', chainId: 1 })),
    ).rejects.toThrow('rpc error');

    expect(redlockService.release).toHaveBeenCalledWith(mockLock);
    expect(redlockService.release).toHaveBeenCalledTimes(1);
  });

  // ── Preservation: default TTL is 30000ms ─────────────────────────────────

  it('default lock TTL is 30000ms when MEDIATION_LOCK_TTL_MS is not set', async () => {
    const { processor, groupRepo, redlockService, stellarService } =
      await buildModule((_key, def) => def); // always returns default

    groupRepo.findOne.mockResolvedValue({
      id: 'g-default',
      contractAddress: '0xc',
      status: GroupStatus.ACTIVE,
      currentRound: 1,
      staleAt: null,
    });
    stellarService.getGroupState.mockResolvedValue({ current_round: 1, status: 'ACTIVE' });

    await processor.process(
      makeJob({ groupId: 'g-default', contractAddress: '0xc', chainId: 1 }),
    );

    expect(redlockService.acquire).toHaveBeenCalledWith(
      'mediation:group:g-default',
      30000,
    );
  });
});
