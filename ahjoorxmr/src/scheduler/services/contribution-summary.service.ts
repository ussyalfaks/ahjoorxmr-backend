import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contribution } from '../../contributions/entities/contribution.entity';
import { Group } from '../../groups/entities/group.entity';
import { Membership } from '../../memberships/entities/membership.entity';

interface ContributionSummary {
  groupId: string;
  groupName: string;
  totalContributions: number;
  totalAmount: string;
  memberCount: number;
}

interface ProgressJob {
  updateProgress(progress: number): Promise<void>;
}

@Injectable()
export class ContributionSummaryService {
  private readonly logger = new Logger(ContributionSummaryService.name);

  constructor(
    @InjectRepository(Contribution)
    private readonly contributionRepository: Repository<Contribution>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate weekly contribution summaries for all active groups.
   *
   * Uses DB-side GROUP BY / SUM aggregation per group — no row-level data is
   * loaded into the JS heap. A heap-usage guard fires after each group; if the
   * threshold is exceeded processing halts and a structured alert is emitted.
   */
  async generateWeeklySummaries(
    job?: ProgressJob,
  ): Promise<ContributionSummary[]> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    // Read env-var config (defaults documented in .env.example)
    // SUMMARY_BATCH_SIZE is retained for env-var contract compatibility.
    this.configService.get<string>('SUMMARY_BATCH_SIZE', '500');
    const maxHeapMb = Number(
      this.configService.get<string>('SCHEDULER_MAX_HEAP_MB', '512'),
    );

    try {
      const groups = await this.groupRepository.find({
        where: { status: 'ACTIVE' as any },
      });

      const summaries: ContributionSummary[] = [];
      const totalGroups = groups.length;
      let stopForMemoryPressure = false;

      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];

        // DB-side aggregation — no row-level data enters the heap
        const aggregate = await this.contributionRepository
          .createQueryBuilder('c')
          .select('COUNT(*)', 'totalContributions')
          .addSelect(
            'COALESCE(SUM(CAST(c.amount AS NUMERIC)), 0)',
            'totalAmount',
          )
          .where('c.groupId = :groupId', { groupId: group.id })
          .andWhere('c.createdAt >= :weekAgo', { weekAgo })
          .getRawOne<{ totalcontributions?: string; totalamount?: string }>();

        const totalContributions = Number(aggregate?.totalcontributions ?? 0);
        const totalAmount = String(aggregate?.totalamount ?? '0');

        const memberCount = await this.membershipRepository.count({
          where: { groupId: group.id },
        });

        summaries.push({
          groupId: group.id,
          groupName: group.name,
          totalContributions,
          totalAmount,
          memberCount,
        });

        // Report group-based progress to BullMQ dashboard
        if (job && totalGroups > 0) {
          await job.updateProgress(
            Math.min(100, Math.round(((i + 1) / totalGroups) * 100)),
          );
        }

        // Heap guard — fires before any further allocation
        const heapUsedMb = process.memoryUsage().heapUsed / (1024 * 1024);
        if (heapUsedMb > maxHeapMb) {
          const alertPayload = {
            event: 'scheduler_memory_guard_triggered',
            groupId: group.id,
            heapUsedMb: Number(heapUsedMb.toFixed(2)),
            thresholdMb: maxHeapMb,
          };
          this.logger.error(JSON.stringify(alertPayload));

          const webhook = this.configService.get<string>(
            'SCHEDULER_MEMORY_ALERT_WEBHOOK',
          );
          if (webhook) {
            await fetch(webhook, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(alertPayload),
            }).catch((err) => {
              this.logger.warn(
                `Failed to send scheduler memory alert webhook: ${(err as Error).message}`,
              );
            });
          }

          stopForMemoryPressure = true;
        }

        if (stopForMemoryPressure) {
          this.logger.warn(
            'Pausing contribution summary processing due to memory guard threshold',
          );
          break;
        }
      }

      this.logger.log(
        `Generated ${summaries.length} weekly contribution summaries`,
      );
      return summaries;
    } catch (error) {
      this.logger.error('Failed to generate weekly summaries:', error);
      throw error;
    }
  }

  /**
   * Send contribution summary to group members
   * In a real implementation, this would integrate with a notification service
   */
  async sendSummariesToMembers(
    summaries: ContributionSummary[],
  ): Promise<void> {
    for (const summary of summaries) {
      // Get all members of the group
      const memberships = await this.membershipRepository.find({
        where: { groupId: summary.groupId },
        relations: ['user'],
      });

      this.logger.log(
        `Sending summary for group ${summary.groupName} to ${memberships.length} members`,
      );

      // TODO: Integrate with notification service to send emails/push notifications
      // For now, just log the summary
      this.logger.debug(`Summary: ${JSON.stringify(summary, null, 2)}`);
    }
  }
}
