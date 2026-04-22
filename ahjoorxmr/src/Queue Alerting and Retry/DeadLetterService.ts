import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationService } from '../notifications/notification.service';
import { NotificationType } from '../notifications/notification.types';
import { DeadLetterRecord } from './entities/dead-letter-record.entity';
import { QueueService } from '../queue/queue.service';
import { ConfigService } from '@nestjs/config';

interface DeadLetterPayload {
  jobId: string;
  groupId: string;
  queueName: string;
  error: string;
  payload: any;
  timestamp: Date;
}

interface ConsecutiveFailureTracker {
  [groupId: string]: {
    count: number;
    lastFailureTime: Date;
  };
}

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);
  private consecutiveFailures: ConsecutiveFailureTracker = {};
  private readonly MAX_CONSECUTIVE_FAILURES: number;
  private readonly FAILURE_RESET_TIMEOUT_MS = 60000; // Reset counter after 1 minute of no failures

  constructor(
    @InjectRepository(DeadLetterRecord)
    private deadLetterRepository: Repository<DeadLetterRecord>,
    private notificationService: NotificationService,
    private queueService: QueueService,
    private configService: ConfigService,
  ) {
    this.MAX_CONSECUTIVE_FAILURES = this.configService.get<number>(
      'MAX_CONSECUTIVE_FAILURES',
      3,
    );
  }

  /**
   * Record a failed job in the dead letter queue
   * and trigger alerting/circuit-breaker logic
   */
  async recordDeadLetter(
    payload: DeadLetterPayload,
  ): Promise<DeadLetterRecord> {
    try {
      // Persist the dead letter record
      const deadLetterRecord = await this.deadLetterRepository.save({
        jobId: payload.jobId,
        groupId: payload.groupId,
        queueName: payload.queueName,
        error: payload.error,
        payload: payload.payload,
        createdAt: payload.timestamp || new Date(),
        status: 'PENDING',
      });

      this.logger.warn(
        `Dead letter recorded: jobId=${payload.jobId}, groupId=${payload.groupId}`,
      );

      // Emit alert notification to admins
      await this.emitAdminAlert(deadLetterRecord);

      // Update consecutive failure counter
      await this.trackConsecutiveFailure(payload.groupId);

      // Check if circuit breaker should be triggered
      await this.checkAndTriggerCircuitBreaker(payload.groupId);

      return deadLetterRecord;
    } catch (error) {
      this.logger.error(
        `Error recording dead letter: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Emit a system alert notification to all admin users
   */
  private async emitAdminAlert(
    deadLetterRecord: DeadLetterRecord,
  ): Promise<void> {
    try {
      const alertMessage = this.formatAlertMessage(deadLetterRecord);

      await this.notificationService.notifyAdmins({
        type: NotificationType.SYSTEM_ALERT,
        title: `Failed Job Detected in Dead Letter Queue`,
        message: alertMessage,
        severity: 'warning',
        metadata: {
          jobId: deadLetterRecord.jobId,
          groupId: deadLetterRecord.groupId,
          queueName: deadLetterRecord.queueName,
          deadLetterId: deadLetterRecord.id,
        },
      });

      this.logger.debug(
        `Admin alert emitted for dead letter: ${deadLetterRecord.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Error emitting admin alert: ${error.message}`,
        error.stack,
      );
      // Don't throw - alerting failure shouldn't break the dead letter recording
    }
  }

  /**
   * Track consecutive failures for a given group
   */
  private async trackConsecutiveFailure(groupId: string): Promise<void> {
    const now = new Date();

    if (!this.consecutiveFailures[groupId]) {
      this.consecutiveFailures[groupId] = {
        count: 1,
        lastFailureTime: now,
      };
      return;
    }

    const tracker = this.consecutiveFailures[groupId];
    const timeSinceLastFailure =
      now.getTime() - tracker.lastFailureTime.getTime();

    // Reset counter if too much time has passed without failures
    if (timeSinceLastFailure > this.FAILURE_RESET_TIMEOUT_MS) {
      tracker.count = 1;
    } else {
      tracker.count += 1;
    }

    tracker.lastFailureTime = now;

    this.logger.debug(
      `Consecutive failures for groupId ${groupId}: ${tracker.count}`,
    );
  }

  /**
   * Check if circuit breaker should be triggered
   * If N consecutive failures for same group, pause the queue
   */
  private async checkAndTriggerCircuitBreaker(groupId: string): Promise<void> {
    const tracker = this.consecutiveFailures[groupId];

    if (!tracker || tracker.count < this.MAX_CONSECUTIVE_FAILURES) {
      return;
    }

    try {
      // Pause the queue for this group
      await this.queueService.pauseQueue(groupId);

      this.logger.error(
        `Circuit breaker triggered for groupId ${groupId}. Queue paused after ${tracker.count} consecutive failures.`,
      );

      // Emit a critical alert
      await this.notificationService.notifyAdmins({
        type: NotificationType.SYSTEM_ALERT,
        title: `🚨 CRITICAL: Queue Paused Due to Repeated Failures`,
        message: `Queue group "${groupId}" has been paused after ${tracker.count} consecutive job failures. Manual intervention required.`,
        severity: 'critical',
        metadata: {
          groupId,
          consecutiveFailures: tracker.count,
          timestamp: new Date(),
        },
      });

      // Reset the counter after triggering
      this.consecutiveFailures[groupId].count = 0;
    } catch (error) {
      this.logger.error(
        `Error triggering circuit breaker: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Retrieve dead letter records with pagination
   */
  async getDeadLetters(
    page: number = 1,
    limit: number = 50,
  ): Promise<{ records: DeadLetterRecord[]; total: number; page: number }> {
    const skip = (page - 1) * limit;

    const [records, total] = await this.deadLetterRepository.findAndCount({
      order: {
        createdAt: 'DESC',
      },
      skip,
      take: limit,
    });

    return {
      records,
      total,
      page,
    };
  }

  /**
   * Retrieve dead letter records for a specific group
   */
  async getDeadLettersByGroup(
    groupId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{ records: DeadLetterRecord[]; total: number; page: number }> {
    const skip = (page - 1) * limit;

    const [records, total] = await this.deadLetterRepository.findAndCount({
      where: { groupId },
      order: {
        createdAt: 'DESC',
      },
      skip,
      take: limit,
    });

    return {
      records,
      total,
      page,
    };
  }

  /**
   * Resolve a dead letter (mark it as resolved)
   */
  async resolveDeadLetter(deadLetterId: string): Promise<DeadLetterRecord> {
    const record = await this.deadLetterRepository.findOne({
      where: { id: deadLetterId },
    });

    if (!record) {
      throw new Error(`Dead letter record not found: ${deadLetterId}`);
    }

    record.status = 'RESOLVED';
    record.resolvedAt = new Date();

    await this.deadLetterRepository.save(record);
    this.logger.debug(`Dead letter marked as resolved: ${deadLetterId}`);

    return record;
  }

  /**
   * Get consecutive failure count for a group
   */
  getConsecutiveFailureCount(groupId: string): number {
    return this.consecutiveFailures[groupId]?.count || 0;
  }

  /**
   * Reset consecutive failure counter for a group
   */
  resetConsecutiveFailures(groupId: string): void {
    if (this.consecutiveFailures[groupId]) {
      this.consecutiveFailures[groupId].count = 0;
    }
  }

  /**
   * Format a readable alert message from a dead letter record
   */
  private formatAlertMessage(deadLetterRecord: DeadLetterRecord): string {
    return `
Job ID: ${deadLetterRecord.jobId}
Group: ${deadLetterRecord.groupId}
Queue: ${deadLetterRecord.queueName}
Error: ${deadLetterRecord.error}
Time: ${deadLetterRecord.createdAt.toISOString()}
    `.trim();
  }
}
