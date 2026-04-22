import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Queue } from 'bullmq';

import { QUEUE_NAMES, BACKOFF_DELAYS, RETRY_CONFIG } from './queue.constants';
import { QueueService } from './queue.service';
import { QueueAdminController } from './queue-admin.controller';
import { DeadLetterService } from './dead-letter.service';
import { BullBoardService } from './bull-board.service';
import { EmailProcessor } from './email.processor';
import { EventSyncProcessor } from './event-sync.processor';
import { GroupSyncProcessor } from './group-sync.processor';
import { PayoutReconciliationProcessor } from './payout-reconciliation.processor';
import { JobFailureService } from './job-failure.service';
import { JobFailuresAdminController } from './job-failures-admin.controller';
import { JobFailure } from './entities/job-failure.entity';
import { MailModule } from '../mail/mail.module';
import { StellarModule } from '../stellar/stellar.module';
import { NotificationsModule } from '../notification/notifications.module';
import { Group } from '../groups/entities/group.entity';
import { Contribution } from '../contributions/entities/contribution.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { PayoutTransaction } from '../groups/entities/payout-transaction.entity';
import { Logger } from '@nestjs/common';

/**
 * Custom backoff strategy registered globally via BullMQ worker options.
 * Delays: attempt 0 → 1 s, attempt 1 → 5 s, attempt 2+ → 30 s.
 */
function customBackoffStrategy(attemptsMade: number): number {
  return (
    BACKOFF_DELAYS[attemptsMade] ?? BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1]
  );
}

// Shared default job options applied at the queue level
const sharedQueueOptions = {
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential' as const, delay: 2000 },
    removeOnComplete: { count: 1000, age: 86_400 },
    removeOnFail: false,
  },
};

@Module({
  imports: [
    ConfigModule,
    MailModule,
    StellarModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      Group,
      Contribution,
      Membership,
      PayoutTransaction,
      JobFailure,
    ]),

    // Register BullMQ with the shared ioredis client from RedisModule
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD'),
          tls:
            configService.get<string>('REDIS_TLS') === 'true' ? {} : undefined,
          maxRetriesPerRequest: null, // required by BullMQ
        },
        // Register our custom backoff strategy globally
        settings: {
          backoffStrategy: customBackoffStrategy,
        },
      }),
      inject: [ConfigService],
    }),

    // Register all queues
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL, ...sharedQueueOptions },
      { name: QUEUE_NAMES.EVENT_SYNC, ...sharedQueueOptions },
      { name: QUEUE_NAMES.GROUP_SYNC, ...sharedQueueOptions },
      { name: QUEUE_NAMES.PAYOUT_RECONCILIATION, ...sharedQueueOptions },
      {
        name: QUEUE_NAMES.DEAD_LETTER,
        defaultJobOptions: { removeOnComplete: false, removeOnFail: false },
      },
    ),
  ],
  controllers: [QueueAdminController, JobFailuresAdminController],
  providers: [
    DeadLetterService,
    QueueService,
    BullBoardService,
    EmailProcessor,
    EventSyncProcessor,
    GroupSyncProcessor,
    PayoutReconciliationProcessor,
    JobFailureService,
  ],
  exports: [
    QueueService,
    BullBoardService,
    JobFailureService,
    // Re-export BullModule so consuming modules can inject the queues directly if needed
    BullModule,
  ],
})
export class QueueModule implements OnModuleInit {
  private readonly logger = new Logger(QueueModule.name);

  constructor(
    private readonly jobFailureService: JobFailureService,
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.EVENT_SYNC) private readonly eventSyncQueue: Queue,
    @InjectQueue(QUEUE_NAMES.GROUP_SYNC) private readonly groupSyncQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PAYOUT_RECONCILIATION) private readonly payoutQueue: Queue,
  ) {}

  onModuleInit() {
    const queues: Queue[] = [
      this.emailQueue,
      this.eventSyncQueue,
      this.groupSyncQueue,
      this.payoutQueue,
    ];

    for (const queue of queues) {
      queue.on('failed', (job, err) => {
        if (!job) return;
        this.jobFailureService
          .persist(
            String(job.id),
            job.name,
            queue.name,
            err,
            job.attemptsMade,
            job.data as Record<string, unknown>,
          )
          .catch((persistErr) =>
            this.logger.error(`Failed to persist job failure: ${persistErr.message}`),
          );
      });
    }
    this.logger.log('Global BullMQ failed event listeners registered');
  }
}
