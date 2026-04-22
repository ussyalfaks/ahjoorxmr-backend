/**
 * Bug Condition Exploration Test — Group Mediation Distributed Locking
 *
 * Property 1: Fault Condition — Concurrent Same-Group Mediation Without Lock
 *
 * CRITICAL: This test encodes the EXPECTED (fixed) behavior.
 * On UNFIXED code (no lock guard), this test FAILS — proving the bug exists.
 * On FIXED code (with redlock), this test PASSES — confirming the fix works.
 *
 * Bug: Two or more handleSyncGroupState executions for the same groupId run
 * concurrently without mutual exclusion, causing groupRepository.save to be
 * called more than once and both executions returning { status: 'PROCESSED' }.
 *
 * Counterexample documented: groupRepository.save called twice for groupId=1
 * when two workers race with no lock guard.
 */

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
    id: 'bug-condition-job',
    name: JOB_NAMES.SYNC_GROUP_STATE,
    data,
    attemptsMade: 0,
    opts: { attempts: 3 },
  }) as unknown as Job;

describe('Bug Condition: Concurrent same-group mediation without distributed lock', () => {
  let processor: GroupSyncProcessor;
  let groupRepo: { findOne: jest.Mock; save: jest.Mock; find: jest.Mock };
  let redlockService: { acquire: jest.Mock; release: jest.Mock };
  let stellarService: { getGroupState: jest.Mock };

  const GROUP_ID = 'group-1';
  const CONTRACT = '0xcontract-abc';

  const activeGroup: Partial<Group> = {
    id: GROUP_ID,
    contractAddress: CONTRACT,
    status: GroupStatus.ACTIVE,
    currentRound: 1,
    staleAt: null,
  };

  /**
   * Simulates the FIXED behavior: first acquire returns a lock, second returns null.
   * On unfixed code (no acquire call), both executions would enter the body.
   */
  function makeLockContention() {
    let lockHeld = false;
    const mockLock = { release: jest.fn().mockResolvedValue(undefined) };

    redlockService.acquire.mockImplementation(async () => {
      if (lockHeld) return null; // second caller is blocked
      lockHeld = true;
      return mockLock;
    });

    redlockService.release.mockImplementation(async () => {
      lockHeld = false;
    });
  }

  beforeEach(async () => {
    groupRepo = { findOne: jest.fn(), save: jest.fn(), find: jest.fn() };
    redlockService = { acquire: jest.fn(), release: jest.fn().mockResolvedValue(undefined) };
    stellarService = { getGroupState: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupSyncProcessor,
        { provide: DeadLetterService, useValue: { moveToDeadLetter: jest.fn() } },
        { provide: StellarService, useValue: stellarService },
        { provide: RedlockService, useValue: redlockService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_key: string, def: string) => def) },
        },
        { provide: getRepositoryToken(Group), useValue: groupRepo },
        { provide: getQueueToken(QUEUE_NAMES.GROUP_SYNC), useValue: { addBulk: jest.fn() } },
      ],
    }).compile();

    processor = module.get(GroupSyncProcessor);
  });

  afterEach(() => jest.clearAllMocks());

  /**
   * Core bug condition test.
   *
   * Two concurrent handleSyncGroupState calls for the same groupId.
   * With the fix: exactly one acquires the lock → PROCESSED; the other → SKIPPED.
   * Without the fix: both enter the body → save called twice, both PROCESSED.
   *
   * EXPECTED OUTCOME on FIXED code: PASSES
   * EXPECTED OUTCOME on UNFIXED code: FAILS (save called twice, no SKIPPED)
   */
  it('allows only one concurrent execution per groupId — the other is SKIPPED', async () => {
    makeLockContention();

    // Simulate a slow mediation body so both calls truly overlap
    groupRepo.findOne.mockResolvedValue({ ...activeGroup });
    stellarService.getGroupState.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ current_round: 2, status: 'ACTIVE' }), 30),
        ),
    );
    groupRepo.save.mockResolvedValue({});

    const jobData = { groupId: GROUP_ID, contractAddress: CONTRACT, chainId: 1 };
    const [result1, result2] = await Promise.all([
      processor.process(makeJob(jobData)),
      processor.process(makeJob(jobData)),
    ]);

    const results = [result1, result2] as Array<{ status: string }>;

    // Exactly one PROCESSED, exactly one SKIPPED
    expect(results.filter((r) => r.status === 'PROCESSED')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'SKIPPED')).toHaveLength(1);

    // groupRepository.save called at most once — no duplicate state transition
    expect(groupRepo.save).toHaveBeenCalledTimes(1);
  });

  /**
   * Verifies the SKIPPED path does not throw.
   * BullMQ must not retry a SKIPPED job.
   */
  it('SKIPPED result does not throw — BullMQ will not retry', async () => {
    // Lock is always unavailable
    redlockService.acquire.mockResolvedValue(null);

    const jobData = { groupId: GROUP_ID, contractAddress: CONTRACT, chainId: 1 };

    await expect(processor.process(makeJob(jobData))).resolves.toEqual({
      status: 'SKIPPED',
    });

    // No DB access attempted when lock is unavailable
    expect(groupRepo.findOne).not.toHaveBeenCalled();
    expect(groupRepo.save).not.toHaveBeenCalled();
  });

  /**
   * Verifies the lock key format is mediation:group:{groupId}.
   * A wrong key would allow concurrent execution for the same group.
   */
  it('acquires lock with key mediation:group:{groupId}', async () => {
    const mockLock = { release: jest.fn().mockResolvedValue(undefined) };
    redlockService.acquire.mockResolvedValue(mockLock);
    groupRepo.findOne.mockResolvedValue({ ...activeGroup });
    stellarService.getGroupState.mockResolvedValue({ current_round: 1, status: 'ACTIVE' });

    const jobData = { groupId: GROUP_ID, contractAddress: CONTRACT, chainId: 1 };
    await processor.process(makeJob(jobData));

    expect(redlockService.acquire).toHaveBeenCalledWith(
      `mediation:group:${GROUP_ID}`,
      expect.any(Number),
    );
  });

  /**
   * Verifies the lock is released even when the mediation body throws.
   * Without a finally block, an error would leave the lock held until TTL expiry.
   */
  it('releases lock in finally block even when mediation body throws', async () => {
    const mockLock = { release: jest.fn().mockResolvedValue(undefined) };
    redlockService.acquire.mockResolvedValue(mockLock);
    groupRepo.findOne.mockResolvedValue({ ...activeGroup });
    stellarService.getGroupState.mockRejectedValue(new Error('contract error'));

    const jobData = { groupId: GROUP_ID, contractAddress: CONTRACT, chainId: 1 };

    await expect(processor.process(makeJob(jobData))).rejects.toThrow('contract error');

    // Lock MUST be released despite the error
    expect(redlockService.release).toHaveBeenCalledWith(mockLock);
  });
});
