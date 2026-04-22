import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, FindOptionsWhere } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobFailure } from './entities/job-failure.entity';
import { QUEUE_NAMES } from './queue.constants';

export interface JobFailureFilter {
  queueName?: string;
  jobName?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class JobFailureService {
  private readonly logger = new Logger(JobFailureService.name);

  constructor(
    @InjectRepository(JobFailure)
    private readonly repo: Repository<JobFailure>,
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.EVENT_SYNC) private readonly eventSyncQueue: Queue,
    @InjectQueue(QUEUE_NAMES.GROUP_SYNC) private readonly groupSyncQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PAYOUT_RECONCILIATION)
    private readonly payoutQueue: Queue,
  ) {}

  async persist(
    jobId: string,
    jobName: string,
    queueName: string,
    error: Error,
    attemptNumber: number,
    data: Record<string, unknown> | null,
  ): Promise<void> {
    try {
      await this.repo.save(
        this.repo.create({
          jobId,
          jobName,
          queueName,
          error: error.message,
          stackTrace: error.stack ?? null,
          attemptNumber,
          data,
        }),
      );
    } catch (err) {
      this.logger.error(`Failed to persist job failure: ${(err as Error).message}`);
    }
  }

  async findAll(filter: JobFailureFilter): Promise<{ data: JobFailure[]; total: number }> {
    const { queueName, jobName, from, to, page = 1, limit = 20 } = filter;
    const where: FindOptionsWhere<JobFailure> = {};

    if (queueName) where.queueName = queueName;
    if (jobName) where.jobName = jobName;
    if (from || to) {
      where.failedAt = Between(
        from ? new Date(from) : new Date(0),
        to ? new Date(to) : new Date(),
      );
    }

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { failedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total };
  }

  async retryAll(): Promise<{ retried: number }> {
    // Get all failed jobs from all queues and re-enqueue them
    const queues: Queue[] = [
      this.emailQueue,
      this.eventSyncQueue,
      this.groupSyncQueue,
      this.payoutQueue,
    ];

    let retried = 0;
    for (const queue of queues) {
      const failedJobs = await queue.getFailed();
      for (const job of failedJobs) {
        try {
          await job.retry();
          // Increment retryCount in our persistence table
          await this.repo.increment({ jobId: String(job.id) }, 'retryCount', 1);
          retried++;
        } catch (err) {
          this.logger.warn(`Failed to retry job ${job.id}: ${(err as Error).message}`);
        }
      }
    }

    this.logger.log(`Retried ${retried} failed jobs`);
    return { retried };
  }

  async getMetrics(): Promise<{ jobs_failed_total: number; jobs_failed_by_queue: Record<string, number> }> {
    const total = await this.repo.count();
    const byQueue = await this.repo
      .createQueryBuilder('jf')
      .select('jf.queueName', 'queueName')
      .addSelect('COUNT(*)', 'count')
      .groupBy('jf.queueName')
      .getRawMany<{ queueName: string; count: string }>();

    const jobs_failed_by_queue: Record<string, number> = {};
    for (const row of byQueue) {
      jobs_failed_by_queue[row.queueName] = parseInt(row.count, 10);
    }

    return { jobs_failed_total: total, jobs_failed_by_queue };
  }
}
