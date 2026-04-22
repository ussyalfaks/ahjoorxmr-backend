import { Injectable, Logger } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';
import {
  EmailJob,
  NotificationType,
  EmailMetadata,
} from '@/common/types/email.types';

@Injectable()
export class EmailQueueService {
  private readonly logger = new Logger(EmailQueueService.name);
  private queue: Queue<EmailJob>;
  private queueEvents: QueueEvents;

  constructor() {
    this.initializeQueue();
  }

  private initializeQueue(): void {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    };

    this.queue = new Queue<EmailJob>('emails', {
      connection: redisConfig,
    });

    this.queueEvents = new QueueEvents('emails', {
      connection: redisConfig,
    });

    this.logger.log('Email queue initialized');
  }

  /**
   * Add email job to queue
   */
  async addEmailJob(
    notificationType: NotificationType,
    metadata: EmailMetadata,
    options?: { delay?: number; attempts?: number },
  ): Promise<string> {
    try {
      const job = await this.queue.add(
        `send-${notificationType}`,
        {
          notificationType,
          metadata,
          timestamp: Date.now(),
        },
        {
          attempts: options?.attempts || 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          delay: options?.delay || 0,
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      this.logger.log(
        `Email job added to queue: ${job.id} (Type: ${notificationType})`,
      );
      return job.id;
    } catch (error) {
      this.logger.error(`Failed to add email to queue: ${error.message}`);
      throw error;
    }
  }

  /**
   * Add multiple email jobs to queue
   */
  async addBulkEmailJobs(
    notificationType: NotificationType,
    recipients: EmailMetadata[],
  ): Promise<string[]> {
    const jobIds: string[] = [];

    for (const metadata of recipients) {
      try {
        const jobId = await this.addEmailJob(notificationType, metadata);
        jobIds.push(jobId);
      } catch (error) {
        this.logger.warn(
          `Failed to queue email for ${metadata.recipientEmail}`,
        );
      }
    }

    return jobIds;
  }

  /**
   * Get queue stats
   */
  async getQueueStats(): Promise<any> {
    try {
      const counts = await this.queue.getJobCounts();
      return {
        active: counts.active,
        waiting: counts.waiting,
        completed: counts.completed,
        failed: counts.failed,
      };
    } catch (error) {
      this.logger.error(`Failed to get queue stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clean up resources
   */
  async close(): Promise<void> {
    await this.queueEvents.close();
    await this.queue.close();
    this.logger.log('Email queue closed');
  }
}
