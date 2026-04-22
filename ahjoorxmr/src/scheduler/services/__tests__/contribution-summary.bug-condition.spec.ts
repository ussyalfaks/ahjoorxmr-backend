/**
 * Bug Condition Exploration Test — In-Heap Row Accumulation
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 *
 * CRITICAL: This test is EXPECTED TO FAIL on unfixed code.
 * Failure confirms the bug exists: the scheduler accumulates all contribution
 * rows into a JS-heap array (`contributions[]`) instead of using DB-side
 * aggregation only.
 *
 * Property 1: Fault Condition — In-Heap Row Accumulation
 *   For a group with 10 000 contributions, the fixed code must NOT:
 *   - Call `getMany()` to fetch individual rows
 *   - Accumulate a `contributions[]` array proportional to row count
 *   - Fire the heap guard AFTER rows are already accumulated (late-guard)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ContributionSummaryService } from '../contribution-summary.service';
import { Contribution } from '../../../contributions/entities/contribution.entity';
import { Group } from '../../../groups/entities/group.entity';
import { Membership } from '../../../memberships/entities/membership.entity';

// ─── Constants ───────────────────────────────────────────────────────────────

const TOTAL_CONTRIBUTIONS = 1_000;
const BATCH_SIZE = 500;
const TOTAL_BATCHES = TOTAL_CONTRIBUTIONS / BATCH_SIZE; // 2 batches

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal fake Contribution row */
function makeContributionRow(i: number) {
  return {
    userId: `user-${i}`,
    walletAddress: `WALLET${i}`,
    amount: '10.00',
    roundNumber: 1,
  };
}

/** Build one batch of BATCH_SIZE rows */
function makeBatch(batchIndex: number) {
  return Array.from({ length: BATCH_SIZE }, (_, i) =>
    makeContributionRow(batchIndex * BATCH_SIZE + i),
  );
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('ContributionSummaryService — Bug Condition: In-Heap Row Accumulation', () => {
  let service: ContributionSummaryService;
  let getManyMock: jest.Mock;
  let getRawOneMock: jest.Mock;

  beforeEach(async () => {
    getManyMock = jest.fn();
    getRawOneMock = jest.fn();

    // Track how many times getMany is called and how many rows are returned
    let batchCallCount = 0;
    getManyMock.mockImplementation(() => {
      const batch = makeBatch(batchCallCount);
      batchCallCount++;
      return Promise.resolve(batch);
    });

    // Aggregate query returns totalContributions = 10 000
    getRawOneMock.mockResolvedValue({
      totalcontributions: String(TOTAL_CONTRIBUTIONS),
      totalamount: '100000.00',
    });

    // Build a chainable QueryBuilder mock
    const queryBuilderMock = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: getRawOneMock,
      getMany: getManyMock,
    };

    const contributionRepoMock = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock),
    };

    const groupRepoMock = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'group-large',
          name: 'Large Group',
          status: 'ACTIVE',
        },
      ]),
    };

    const membershipRepoMock = {
      count: jest.fn().mockResolvedValue(50),
    };

    const configServiceMock = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'SUMMARY_BATCH_SIZE') return String(BATCH_SIZE);
        if (key === 'SCHEDULER_MAX_HEAP_MB') return '512';
        return defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContributionSummaryService,
        {
          provide: getRepositoryToken(Contribution),
          useValue: contributionRepoMock,
        },
        { provide: getRepositoryToken(Group), useValue: groupRepoMock },
        {
          provide: getRepositoryToken(Membership),
          useValue: membershipRepoMock,
        },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get(ContributionSummaryService);
  });

  // ── Property 1a: getMany must never be called ─────────────────────────────
  //
  // The fixed code uses DB-side GROUP BY / SUM via getRawOne only.
  // On UNFIXED code: getMany IS called (2 times for 1 000 rows / 500 batch).
  // EXPECTED ON UNFIXED CODE: FAIL — getMany is called 2 times.

  it('Property 1a: getMany is never called — fixed code uses DB-side aggregation only', async () => {
    await service.generateWeeklySummaries();

    // On fixed code: getMany should never be called
    // On UNFIXED code: getMany is called TOTAL_BATCHES (20) times — TEST FAILS
    expect(getManyMock).not.toHaveBeenCalled();
  });

  // ── Property 1b: contributions[] does not accumulate 1 000 rows ──────────
  //
  // The fixed code returns summaries with no row-level contributions array,
  // or an empty one. On UNFIXED code: contributions[] has 1 000 entries.
  // EXPECTED ON UNFIXED CODE: FAIL — contributions array has 1 000 entries.

  it('Property 1b: returned summary does NOT contain a contributions[] array of 10 000 entries', async () => {
    const summaries = await service.generateWeeklySummaries();

    expect(summaries).toHaveLength(1);
    const summary = summaries[0];

    // On fixed code: contributions field should be absent or empty
    // On UNFIXED code: contributions.length === 1 000 — TEST FAILS
    const rowCount = summary.contributions?.length ?? 0;
    expect(rowCount).toBe(0);
  });

  // ── Property 1c: late-guard counterexample ────────────────────────────────
  //
  // On UNFIXED code the heap guard fires AFTER rows are already pushed into
  // contributions[]. We verify this by checking that if getMany was called,
  // rows were accumulated before any guard could fire.
  //
  // The fixed code never calls getMany, so this scenario cannot occur.
  // EXPECTED ON UNFIXED CODE: FAIL — getMany was called, rows accumulated first.

  it('Property 1c: heap guard does not fire after rows are already accumulated (late-guard counterexample)', async () => {
    // Simulate heap usage just above threshold to trigger the guard
    const originalMemoryUsage = process.memoryUsage;
    let heapCheckCount = 0;

    jest.spyOn(process, 'memoryUsage').mockImplementation(() => {
      heapCheckCount++;
      return {
        ...originalMemoryUsage(),
        // Exceed 512 MB threshold on first heap check
        heapUsed: 600 * 1024 * 1024,
      };
    });

    try {
      await service.generateWeeklySummaries();

      // On fixed code: getMany is never called, so no rows were accumulated
      // before the guard check. The guard fires before any allocation.
      // On UNFIXED code: getMany was called at least once (500 rows pushed)
      // before the heap check — TEST FAILS.
      expect(getManyMock).not.toHaveBeenCalled();
    } finally {
      jest.restoreAllMocks();
    }
  });
});
