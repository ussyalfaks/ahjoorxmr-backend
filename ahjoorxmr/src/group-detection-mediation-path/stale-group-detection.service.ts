import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Group } from '../groups/entities/group.entity';
import { GroupStatus } from '../groups/enums/group-status.enum';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class StaleGroupDetectionService {
  private readonly logger = new Logger(StaleGroupDetectionService.name);

  /**
   * A group is considered stale if it has had no activity for this many days.
   */
  private readonly STALE_THRESHOLD_DAYS = 30;

  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async detectAndMarkStaleGroups(): Promise<void> {
    this.logger.log('Running stale group detection...');

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - this.STALE_THRESHOLD_DAYS);

    const staleGroups = await this.groupRepository.find({
      where: {
        status: GroupStatus.ACTIVE,
        lastActiveAt: LessThan(thresholdDate),
      },
    });

    if (staleGroups.length === 0) {
      this.logger.log('No stale groups found.');
      return;
    }

    this.logger.log(
      `Found ${staleGroups.length} stale group(s). Processing...`,
    );

    const now = new Date();

    await Promise.allSettled(
      staleGroups.map(async (group) => {
        try {
          await this.markGroupAsStale(group, now);
        } catch (err) {
          this.logger.error(
            `Failed to mark group ${group.id} as stale: ${(err as Error).message}`,
            (err as Error).stack,
          );
        }
      }),
    );

    this.logger.log('Stale group detection complete.');
  }

  async markGroupAsStale(group: Group, now: Date = new Date()): Promise<Group> {
    group.staleAt = now;
    group.status = GroupStatus.STALE;

    const saved = await this.groupRepository.save(group);

    this.logger.warn(
      `Group "${group.name}" (${group.id}) marked as STALE. Last active round: ${group.currentRound}`,
    );

    // Notify the group admin about the stale status
    await this.notificationsService.notifyGroupStale(group.adminId, {
      groupId: group.id,
      groupName: group.name,
      lastActiveRound: group.currentRound,
    });

    return saved;
  }
}
