import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { format } from 'date-fns';
import { Repository } from 'typeorm';

import { contributionSummaryConfig } from './config/contribution-summary.config';
import { Group } from './entities/group.entity';
import { GroupStatus } from './enums/group-status.enum';
import { NotificationType } from './enums/notification-type.enum';
import { NotificationsService } from './notifications/notifications.service';

export interface ReminderResult {
  groupId: string;
  groupName: string;
  roundNumber: number;
  totalMembers: number;
  remindedCount: number;
  skippedCount: number; // already paid
  dedupedCount: number; // idempotency hit
}

export interface SchedulerRunResult {
  ranAt: string;
  groups: ReminderResult[];
  totalReminded: number;
  totalSkipped: number;
  totalDeduped: number;
}

@Injectable()
export class ContributionSummaryService {
  private readonly logger = new Logger(ContributionSummaryService.name);

  constructor(
    @InjectRepository(Group)
    private readonly groupRepo: Repository<Group>,

    private readonly notificationsService: NotificationsService,

    @Inject(contributionSummaryConfig.KEY)
    private readonly config: ConfigType<typeof contributionSummaryConfig>,

    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Registers the cron job dynamically so the schedule can be driven by
   * a config / env value rather than a hardcoded `@Cron()` decorator.
   */
  onModuleInit(): void {
    const schedule = this.config.reminderSchedule;
    this.logger.log(
      `Registering contribution-reminder cron with schedule: "${schedule}"`,
    );

    const job = new CronJob(schedule, () => {
      void this.runReminders();
    });

    this.schedulerRegistry.addCronJob('contribution-reminder', job);
    job.start();
  }

  onModuleDestroy(): void {
    try {
      this.schedulerRegistry.deleteCronJob('contribution-reminder');
    } catch {
      // Job may not exist if onModuleInit never completed.
    }
  }

  // ─── Core logic ─────────────────────────────────────────────────────────────

  /**
   * Public entry-point so it can be triggered manually (e.g. via an admin
   * endpoint or from tests) without waiting for the cron tick.
   */
  async runReminders(): Promise<SchedulerRunResult> {
    const ranAt = new Date().toISOString();
    this.logger.log(`ContributionSummaryScheduler starting — ranAt=${ranAt}`);

    const activeGroups = await this.fetchActiveGroups();

    if (activeGroups.length === 0) {
      this.logger.log('No ACTIVE groups found — nothing to do.');
      return {
        ranAt,
        groups: [],
        totalReminded: 0,
        totalSkipped: 0,
        totalDeduped: 0,
      };
    }

    const groupResults = await Promise.all(
      activeGroups.map((group) => this.processGroup(group)),
    );

    const result: SchedulerRunResult = {
      ranAt,
      groups: groupResults,
      totalReminded: groupResults.reduce((s, r) => s + r.remindedCount, 0),
      totalSkipped: groupResults.reduce((s, r) => s + r.skippedCount, 0),
      totalDeduped: groupResults.reduce((s, r) => s + r.dedupedCount, 0),
    };

    this.logger.log(
      `ContributionSummaryScheduler done — ` +
        `reminded=${result.totalReminded}, ` +
        `skipped=${result.totalSkipped}, ` +
        `deduped=${result.totalDeduped}`,
    );

    return result;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async fetchActiveGroups(): Promise<Group[]> {
    return this.groupRepo.find({
      where: { status: GroupStatus.ACTIVE },
      relations: ['members'],
    });
  }

  private async processGroup(group: Group): Promise<ReminderResult> {
    const members = await group.members; // lazy relation
    const today = format(new Date(), 'yyyy-MM-dd');

    let remindedCount = 0;
    let skippedCount = 0;
    let dedupedCount = 0;

    for (const member of members) {
      // ── Guard: already paid this round ─────────────────────────────────────
      if (member.hasPaidCurrentRound) {
        skippedCount++;
        continue;
      }

      const idempotencyKey = this.buildIdempotencyKey({
        userId: member.userId,
        groupId: group.id,
        roundNumber: group.currentRound,
        date: today,
      });

      const result = await this.notificationsService.notify({
        userId: member.userId,
        type: NotificationType.CONTRIBUTION_REMINDER,
        metadata: {
          groupId: group.id,
          groupName: group.name,
          roundNumber: group.currentRound,
          contributionAmount: Number(group.contributionAmount),
        },
        idempotencyKey,
      });

      if (result.created) {
        remindedCount++;
        this.logger.debug(
          `Reminder sent — userId=${member.userId} groupId=${group.id} round=${group.currentRound}`,
        );
      } else {
        dedupedCount++;
      }
    }

    return {
      groupId: group.id,
      groupName: group.name,
      roundNumber: group.currentRound,
      totalMembers: members.length,
      remindedCount,
      skippedCount,
      dedupedCount,
    };
  }

  /**
   * Builds a deterministic idempotency key so that re-running the job on
   * the same calendar day never double-notifies a member for the same round.
   *
   * Format: `CONTRIBUTION_REMINDER:{userId}:{groupId}:{roundNumber}:{date}`
   */
  buildIdempotencyKey(opts: {
    userId: string;
    groupId: string;
    roundNumber: number;
    date: string;
  }): string {
    const { userId, groupId, roundNumber, date } = opts;
    return `CONTRIBUTION_REMINDER:${userId}:${groupId}:${roundNumber}:${date}`;
  }
}
