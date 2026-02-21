import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES } from './queue.constants';
import { DeadLetterJobData } from './queue.interfaces';

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.DEAD_LETTER)
    private readonly deadLetterQueue: Queue,
  ) {}

  async moveToDeadLetter(
    job: Job,
    error: Error,
    originalQueue: string,
  ): Promise<void> {
    const payload: DeadLetterJobData = {
      originalQueue,
      originalJobId: job.id?.toString(),
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: error.message,
      failedAt: new Date().toISOString(),
      attemptsMade: job.attemptsMade,
      stackTrace: error.stack,
    };

    this.logger.error(
      `Dead-letter entry: queue=${originalQueue} jobName=${job.name} jobId=${job.id} reason="${error.message}"`,
      {
        ...payload,
        // omit potentially large data from log line
        originalJobData: '[see dead-letter queue]',
      },
    );

    await this.deadLetterQueue.add(JOB_NAMES.DEAD_LETTER, payload, {
      removeOnComplete: false,
      removeOnFail: false,
    });
  }
}
