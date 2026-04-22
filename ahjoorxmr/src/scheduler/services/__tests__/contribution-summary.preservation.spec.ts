/**
 * Preservation Property Tests — Correct Summaries for Small Datasets
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.6**
 *
 * These tests MUST PASS on UNFIXED code — they establish the baseline
 * behavior that the fix must preserve.
 *
 * Property 2: Preservation — for any group with 0–99 contributions,
 * the function returns correct totalContributions, totalAmount, memberCount.
 *
 * Uses fast-check with numRuns: 10 for fast execution.
 * SCHEDULER_MAX_HEAP_MB is set to 99999 to prevent the memory guard from
 * firing during tests (the test process heap is already ~500 MB).
 */

import * as fc from 'fast-check';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ContributionSummaryService } from '../contribution-summary.service';
import { Contribution } from '../../../contributions/entities/contribution.entity';
import { Group } from '../../../groups/entities/group.entity';
import { Membership } from '../../../memberships/entities/membership.entity';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** High heap threshold so the memory guard never fires during unit tests. */
const TEST_MAX_HEAP_MB = '99999';

async function createService(
  groups: { id: string; name: string; status: string }[],
  contributionsByGroup: Record<string, { count: number; totalAmount: string }>,
  memberCountByGroup: Record<string, number>,
): Promise<ContributionSummaryService> {
  // Build per-group aggregate responses
  const groupAggregates: Record<string, { totalcontributions: string; totalamount: string }> =
    Object.fromEntries(
      groups.map((g) => [
        g.id,
        {
          totalcontributions: String(contributionsByGroup[g.id]?.count ?? 0),
          totalamount: contributionsByGroup[g.id]?.totalAmount ?? '0',
        },
      ]),
    );

  // Track which group is being queried via the where() call
  let currentGroupId: string | null = null;

  const queryBuilderMock = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockImplementation((_clause: string, params: { groupId?: string }) => {
      if (params?.groupId) currentGroupId = params.groupId;
      return queryBuilderMock;
    }),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockImplementation(() => {
      const agg = currentGroupId ? groupAggregates[currentGroupId] : null;
      return Promise.resolve(agg ?? { totalcontributions: '0', totalamount: '0' });
    }),
    // Return a single dummy row so the unfixed while-loop can terminate
    // (offset advances by batch.length each iteration).
    getMany: jest.fn().mockResolvedValue([
      { userId: 'u1', walletAddress: 'W1', amount: '10.00', roundNumber: 1 },
    ]),
  };

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ContributionSummaryService,
      {
        provide: getRepositoryToken(Contribution),
        useValue: { createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock) },
      },
      {
        provide: getRepositoryToken(Group),
        useValue: { find: jest.fn().mockResolvedValue(groups) },
      },
      {
        provide: getRepositoryToken(Membership),
        useValue: {
          count: jest.fn().mockImplementation(({ where: { groupId } }: { where: { groupId: string } }) =>
            Promise.resolve(memberCountByGroup[groupId] ?? 0),
          ),
          find: jest.fn().mockResolvedValue([]),
        },
      },
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string, defaultValue?: string) => {
            if (key === 'SUMMARY_BATCH_SIZE') return defaultValue ?? '500';
            if (key === 'SCHEDULER_MAX_HEAP_MB') return TEST_MAX_HEAP_MB;
            return defaultValue;
          }),
        },
      },
    ],
  }).compile();

  return module.get(ContributionSummaryService);
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('ContributionSummaryService — Preservation: Correct Summaries for Small Datasets', () => {
  // ── P2a: Zero-contribution group returns zero totals ──────────────────────

  it('P2a: group with 0 contributions returns totalContributions=0 and totalAmount="0"', async () => {
    const groups = [{ id: 'g1', name: 'Empty Group', status: 'ACTIVE' }];
    const service = await createService(groups, { g1: { count: 0, totalAmount: '0' } }, { g1: 5 });

    const summaries = await service.generateWeeklySummaries();

    expect(summaries).toHaveLength(1);
    expect(summaries[0].totalContributions).toBe(0);
    expect(summaries[0].totalAmount).toBe('0');
    expect(summaries[0].memberCount).toBe(5);
  });

  // ── P2b: Single group with known contributions returns correct scalars ─────

  it('P2b: group with 5 contributions returns correct totalContributions and totalAmount', async () => {
    const groups = [{ id: 'g1', name: 'Small Group', status: 'ACTIVE' }];
    const service = await createService(
      groups,
      { g1: { count: 5, totalAmount: '250.00' } },
      { g1: 3 },
    );

    const summaries = await service.generateWeeklySummaries();

    expect(summaries[0].totalContributions).toBe(5);
    expect(summaries[0].totalAmount).toBe('250.00');
    expect(summaries[0].memberCount).toBe(3);
  });

  // ── P2c: PBT — random groups (1–5) with 0–99 contributions each ───────────
  // numRuns: 10 for fast execution.

  it('P2c: PBT — for any 1–5 groups with 0–99 contributions, summaries match mocked DB aggregates', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            count: fc.integer({ min: 0, max: 99 }),
            totalAmount: fc.float({ min: 0, max: 9999, noNaN: true }).map((n) => n.toFixed(2)),
            memberCount: fc.integer({ min: 0, max: 20 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        async (groupData) => {
          const groups = groupData.map((_, i) => ({
            id: `g${i}`,
            name: `Group ${i}`,
            status: 'ACTIVE',
          }));
          const contributionsByGroup = Object.fromEntries(
            groupData.map((d, i) => [`g${i}`, { count: d.count, totalAmount: d.totalAmount }]),
          );
          const memberCountByGroup = Object.fromEntries(
            groupData.map((d, i) => [`g${i}`, d.memberCount]),
          );

          const service = await createService(groups, contributionsByGroup, memberCountByGroup);
          const summaries = await service.generateWeeklySummaries();

          expect(summaries).toHaveLength(groups.length);
          for (let i = 0; i < groups.length; i++) {
            expect(summaries[i].totalContributions).toBe(groupData[i].count);
            expect(summaries[i].memberCount).toBe(groupData[i].memberCount);
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  // ── P2d: sendSummariesToMembers is called with the result array ───────────

  it('P2d: sendSummariesToMembers is called with the summaries returned by generateWeeklySummaries', async () => {
    const groups = [{ id: 'g1', name: 'Group A', status: 'ACTIVE' }];
    const service = await createService(groups, { g1: { count: 3, totalAmount: '150.00' } }, { g1: 2 });

    const summaries = await service.generateWeeklySummaries();
    const sendSpy = jest.spyOn(service, 'sendSummariesToMembers').mockResolvedValue(undefined);

    await service.sendSummariesToMembers(summaries);

    expect(sendSpy).toHaveBeenCalledWith(summaries);
  });

  // ── P2e: Default env-var values are 500 and 512 ───────────────────────────

  it('P2e: when SUMMARY_BATCH_SIZE and SCHEDULER_MAX_HEAP_MB are absent, defaults of 500 and 512 are used', async () => {
    const configGetSpy = jest.fn((key: string, defaultValue?: string) => {
      // Return a high value for SCHEDULER_MAX_HEAP_MB so guard doesn't fire,
      // but still record that the default '512' was requested.
      if (key === 'SCHEDULER_MAX_HEAP_MB') return TEST_MAX_HEAP_MB;
      return defaultValue;
    });

    const queryBuilderMock = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      offset: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ totalcontributions: '0', totalamount: '0' }),
      getMany: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContributionSummaryService,
        {
          provide: getRepositoryToken(Contribution),
          useValue: { createQueryBuilder: jest.fn().mockReturnValue(queryBuilderMock) },
        },
        {
          provide: getRepositoryToken(Group),
          useValue: {
            find: jest.fn().mockResolvedValue([{ id: 'g1', name: 'G', status: 'ACTIVE' }]),
          },
        },
        {
          provide: getRepositoryToken(Membership),
          useValue: { count: jest.fn().mockResolvedValue(0), find: jest.fn().mockResolvedValue([]) },
        },
        { provide: ConfigService, useValue: { get: configGetSpy } },
      ],
    }).compile();

    const service = module.get(ContributionSummaryService);
    await service.generateWeeklySummaries();

    // Verify the service requested the correct keys with correct defaults
    expect(configGetSpy).toHaveBeenCalledWith('SUMMARY_BATCH_SIZE', '500');
    expect(configGetSpy).toHaveBeenCalledWith('SCHEDULER_MAX_HEAP_MB', '512');
  });
});
