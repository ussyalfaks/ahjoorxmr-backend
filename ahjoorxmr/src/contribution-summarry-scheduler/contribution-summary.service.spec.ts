import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CronJob } from 'cron';

import { contributionSummaryConfig } from './config/contribution-summary.config';
import { ContributionSummaryService } from './contribution-summary.service';
import { Group } from './entities/group.entity';
import { GroupStatus } from './enums/group-status.enum';
import { NotificationType } from './enums/notification-type.enum';
import {
  NotificationsService,
  NotifyResult,
} from './notifications/notifications.service';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeGroup(
  overrides: Partial<Group> & { memberOverrides?: any[] } = {},
): Group {
  const { memberOverrides, ...rest } = overrides;

  const members = (
    memberOverrides ?? [
      { userId: 'user-1', groupId: 'group-1', hasPaidCurrentRound: false },
      { userId: 'user-2', groupId: 'group-1', hasPaidCurrentRound: true },
    ]
  ).map((m: any) => ({ ...m, groupId: rest.id ?? 'group-1' }));

  const group = {
    id: 'group-1',
    name: 'Test Ajo',
    status: GroupStatus.ACTIVE,
    currentRound: 3,
    contributionAmount: 5000,
    members: Promise.resolve(members),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...rest,
  } as Group;

  return group;
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe('ContributionSummaryService', () => {
  let service: ContributionSummaryService;
  let notificationsService: jest.Mocked<NotificationsService>;
  let groupRepo: { find: jest.Mock };
  let schedulerRegistry: { addCronJob: jest.Mock; deleteCronJob: jest.Mock };

  const defaultConfig = { reminderSchedule: '0 8 * * *' };

  beforeEach(async () => {
    groupRepo = { find: jest.fn() };

    notificationsService = {
      notify: jest.fn(),
    } as any;

    schedulerRegistry = {
      addCronJob: jest.fn(),
      deleteCronJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContributionSummaryService,
        { provide: getRepositoryToken(Group), useValue: groupRepo },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: contributionSummaryConfig.KEY, useValue: defaultConfig },
        { provide: SchedulerRegistry, useValue: schedulerRegistry },
      ],
    }).compile();

    service = module.get(ContributionSummaryService);
  });

  // ── onModuleInit ────────────────────────────────────────────────────────────

  describe('onModuleInit', () => {
    it('registers a cron job with the schedule from config', () => {
      service.onModuleInit();

      expect(schedulerRegistry.addCronJob).toHaveBeenCalledTimes(1);
      const [name, job] = schedulerRegistry.addCronJob.mock.calls[0];
      expect(name).toBe('contribution-reminder');
      expect(job).toBeInstanceOf(CronJob);
    });

    it('uses the schedule expression supplied via config', () => {
      // Override config to a non-default schedule
      (service as any).config = { reminderSchedule: '0 9 * * 1' };
      service.onModuleInit();

      const [, job]: [string, CronJob] =
        schedulerRegistry.addCronJob.mock.calls[0];
      // CronJob stores the pattern — verify it was constructed without throwing
      expect(job).toBeDefined();
    });
  });

  // ── onModuleDestroy ─────────────────────────────────────────────────────────

  describe('onModuleDestroy', () => {
    it('removes the cron job from the registry', () => {
      service.onModuleDestroy();
      expect(schedulerRegistry.deleteCronJob).toHaveBeenCalledWith(
        'contribution-reminder',
      );
    });

    it('does not throw if the job was never registered', () => {
      schedulerRegistry.deleteCronJob.mockImplementation(() => {
        throw new Error('No cron job found');
      });
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });

  // ── buildIdempotencyKey ─────────────────────────────────────────────────────

  describe('buildIdempotencyKey', () => {
    it('builds a deterministic key from its inputs', () => {
      const key = service.buildIdempotencyKey({
        userId: 'u1',
        groupId: 'g1',
        roundNumber: 2,
        date: '2026-03-27',
      });
      expect(key).toBe('CONTRIBUTION_REMINDER:u1:g1:2:2026-03-27');
    });

    it('produces different keys for different dates (same round)', () => {
      const opts = { userId: 'u1', groupId: 'g1', roundNumber: 2 };
      const key1 = service.buildIdempotencyKey({ ...opts, date: '2026-03-27' });
      const key2 = service.buildIdempotencyKey({ ...opts, date: '2026-03-28' });
      expect(key1).not.toBe(key2);
    });

    it('produces different keys for different rounds (same date)', () => {
      const opts = { userId: 'u1', groupId: 'g1', date: '2026-03-27' };
      const key1 = service.buildIdempotencyKey({ ...opts, roundNumber: 1 });
      const key2 = service.buildIdempotencyKey({ ...opts, roundNumber: 2 });
      expect(key1).not.toBe(key2);
    });
  });

  // ── runReminders — no active groups ────────────────────────────────────────

  describe('runReminders — no active groups', () => {
    beforeEach(() => {
      groupRepo.find.mockResolvedValue([]);
    });

    it('returns a zero-count result without calling notify', async () => {
      const result = await service.runReminders();

      expect(result.totalReminded).toBe(0);
      expect(result.totalSkipped).toBe(0);
      expect(result.totalDeduped).toBe(0);
      expect(result.groups).toHaveLength(0);
      expect(notificationsService.notify).not.toHaveBeenCalled();
    });
  });

  // ── runReminders — mixed members ───────────────────────────────────────────

  describe('runReminders — group with paid and unpaid members', () => {
    beforeEach(() => {
      groupRepo.find.mockResolvedValue([
        makeGroup({
          memberOverrides: [
            { userId: 'user-paid', hasPaidCurrentRound: true },
            { userId: 'user-unpaid-1', hasPaidCurrentRound: false },
            { userId: 'user-unpaid-2', hasPaidCurrentRound: false },
          ],
        }),
      ]);

      notificationsService.notify.mockResolvedValue({
        created: true,
      } as NotifyResult);
    });

    it('only notifies members who have NOT paid', async () => {
      const result = await service.runReminders();

      expect(notificationsService.notify).toHaveBeenCalledTimes(2);
      const calledUserIds = notificationsService.notify.mock.calls.map(
        ([p]) => p.userId,
      );
      expect(calledUserIds).toContain('user-unpaid-1');
      expect(calledUserIds).toContain('user-unpaid-2');
      expect(calledUserIds).not.toContain('user-paid');
    });

    it('records correct reminded / skipped counts', async () => {
      const result = await service.runReminders();

      expect(result.totalReminded).toBe(2);
      expect(result.totalSkipped).toBe(1);
      expect(result.totalDeduped).toBe(0);
    });

    it('passes CONTRIBUTION_REMINDER type to notify', async () => {
      await service.runReminders();

      notificationsService.notify.mock.calls.forEach(([payload]) => {
        expect(payload.type).toBe(NotificationType.CONTRIBUTION_REMINDER);
      });
    });

    it('includes group name, round number, and contribution amount in metadata', async () => {
      await service.runReminders();

      notificationsService.notify.mock.calls.forEach(([payload]) => {
        expect(payload.metadata).toMatchObject({
          groupName: 'Test Ajo',
          roundNumber: 3,
          contributionAmount: 5000,
          groupId: 'group-1',
        });
      });
    });

    it('attaches an idempotencyKey to every notify call', async () => {
      await service.runReminders();

      notificationsService.notify.mock.calls.forEach(([payload]) => {
        expect(payload.idempotencyKey).toBeDefined();
        expect(payload.idempotencyKey).toMatch(/^CONTRIBUTION_REMINDER:/);
      });
    });
  });

  // ── runReminders — all members already paid ────────────────────────────────

  describe('runReminders — all members already paid', () => {
    beforeEach(() => {
      groupRepo.find.mockResolvedValue([
        makeGroup({
          memberOverrides: [
            { userId: 'user-1', hasPaidCurrentRound: true },
            { userId: 'user-2', hasPaidCurrentRound: true },
          ],
        }),
      ]);
    });

    it('sends zero notifications', async () => {
      const result = await service.runReminders();

      expect(notificationsService.notify).not.toHaveBeenCalled();
      expect(result.totalSkipped).toBe(2);
      expect(result.totalReminded).toBe(0);
    });
  });

  // ── runReminders — idempotency deduplication ───────────────────────────────

  describe('runReminders — idempotency', () => {
    beforeEach(() => {
      groupRepo.find.mockResolvedValue([
        makeGroup({
          memberOverrides: [
            { userId: 'user-unpaid', hasPaidCurrentRound: false },
          ],
        }),
      ]);
    });

    it('counts as deduped when notify returns created=false', async () => {
      notificationsService.notify.mockResolvedValue({ created: false });

      const result = await service.runReminders();

      expect(result.totalDeduped).toBe(1);
      expect(result.totalReminded).toBe(0);
    });

    it('uses the same idempotency key on consecutive runs within the same day', async () => {
      notificationsService.notify.mockResolvedValue({ created: true });

      await service.runReminders();
      await service.runReminders();

      const keys = notificationsService.notify.mock.calls.map(
        ([p]) => p.idempotencyKey,
      );
      // Both calls should have identical keys (same day, same round, same user/group)
      expect(keys[0]).toBe(keys[1]);
    });
  });

  // ── runReminders — multiple groups ─────────────────────────────────────────

  describe('runReminders — multiple active groups', () => {
    beforeEach(() => {
      groupRepo.find.mockResolvedValue([
        makeGroup({
          id: 'group-A',
          name: 'Group A',
          currentRound: 1,
          memberOverrides: [{ userId: 'uA1', hasPaidCurrentRound: false }],
        }),
        makeGroup({
          id: 'group-B',
          name: 'Group B',
          currentRound: 2,
          memberOverrides: [
            { userId: 'uB1', hasPaidCurrentRound: false },
            { userId: 'uB2', hasPaidCurrentRound: false },
          ],
        }),
      ]);

      notificationsService.notify.mockResolvedValue({ created: true });
    });

    it('processes all groups and aggregates totals', async () => {
      const result = await service.runReminders();

      expect(result.groups).toHaveLength(2);
      expect(result.totalReminded).toBe(3);
    });

    it('uses group-specific metadata per notification', async () => {
      await service.runReminders();

      const groupACalls = notificationsService.notify.mock.calls.filter(
        ([p]) => p.metadata.groupId === 'group-A',
      );
      const groupBCalls = notificationsService.notify.mock.calls.filter(
        ([p]) => p.metadata.groupId === 'group-B',
      );

      expect(groupACalls).toHaveLength(1);
      expect(groupBCalls).toHaveLength(2);

      expect(groupACalls[0][0].metadata.roundNumber).toBe(1);
      expect(groupBCalls[0][0].metadata.roundNumber).toBe(2);
    });
  });

  // ── runReminders — query filter ─────────────────────────────────────────────

  describe('runReminders — repository query', () => {
    it('queries only ACTIVE groups', async () => {
      groupRepo.find.mockResolvedValue([]);
      await service.runReminders();

      expect(groupRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: GroupStatus.ACTIVE },
        }),
      );
    });

    it('eagerly loads members relation', async () => {
      groupRepo.find.mockResolvedValue([]);
      await service.runReminders();

      expect(groupRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          relations: ['members'],
        }),
      );
    });
  });
});
