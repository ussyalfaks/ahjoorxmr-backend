import { Logger } from '@nestjs/common';
import { Worker, Job, UnrecoverableError } from 'bullmq';
import { MailService } from '@/mail/services/mail.service';
import { EmailJob, NotificationType } from '@/common/types/email.types';

export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);
  private worker: Worker<EmailJob>;

  constructor(
    private readonly mailService: MailService,
    queueName: string = 'emails',
  ) {
    this.initializeWorker(queueName);
  }

  private initializeWorker(queueName: string): void {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    };

    this.worker = new Worker<EmailJob>(
      queueName,
      async (job: Job<EmailJob>) => this.processEmailJob(job),
      {
        connection: redisConfig,
        concurrency: 5,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Email job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Email job ${job?.id} failed: ${error.message}`);
    });

    this.logger.log(`Email processor initialized with queue: ${queueName}`);
  }

  /**
   * Process individual email job
   */
  private async processEmailJob(job: Job<EmailJob>): Promise<void> {
    try {
      const { notificationType, metadata } = job.data;

      // Validate notification type
      if (!Object.values(NotificationType).includes(notificationType)) {
        throw new UnrecoverableError(
          `Invalid notification type: ${notificationType}`,
        );
      }

      // Validate metadata exists and has recipient email
      if (!metadata || !metadata.recipientEmail) {
        throw new UnrecoverableError('Missing required metadata fields');
      }

      // Send email
      const messageId = await this.mailService.sendEmail(
        notificationType,
        metadata,
      );

      job.data.timestamp = Date.now();
      this.logger.debug(`Email sent with message ID: ${messageId}`);
    } catch (error) {
      if (error instanceof UnrecoverableError) {
        this.logger.error(
          `Unrecoverable error in job ${job.id}: ${error.message}`,
        );
        throw error; // Will not retry
      }

      // Recoverable error - will retry based on BullMQ settings
      this.logger.warn(`Error processing job ${job.id}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gracefully shutdown the worker
   */
  async close(): Promise<void> {
    await this.worker.close();
    this.logger.log('Email processor closed');
  }
}
