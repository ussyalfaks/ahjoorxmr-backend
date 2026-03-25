import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeadLetterRecord } from './entities/dead-letter.entity';
import { NotificationService } from '../notifications/notification.service';
import { NotificationType } from '../notifications/enum/notification-type.enum';
import { ConfigService } from '@nestjs/config';

export interface DeadLetterPayload {
  jobId: string;
  groupId: string;
  jobType: string;
  payload: Record<string, any>;
  error: string;
  stackTrace?: string;
  attemptCount: number;
}

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);
  private readonly maxConsecutiveFailures: number;
  private readonly failureCountMap = new Map<string, number>();

  constructor(
    @InjectRepository(DeadLetterRecord)
    private deadLetterRepository: Repository<DeadLetterRecord>,
    private notificationService: NotificationService,
    private configService: ConfigService,
  ) {
    this.maxConsecutiveFailures = this.configService.get<number>(
      'MAX_CONSECUTIVE_FAILURES',
      3,
    );
  }

  /**
   * Record a failed job in the dead letter queue and trigger alerting
   */
  async recordDeadLetter(payload: DeadLetterPayload): Promise<DeadLetterRecord> {
    try {
      // Persist the dead letter record
      const record = this.deadLetterRepository.create({
        jobId: payload.jobId,
        groupId: payload.groupId,
        jobType: payload.jobType,
        payload: payload.payload,
        error: payload.error,
        stackTrace: payload.stackTrace,
        attemptCount: payload.attemptCount,
        recordedAt: new Date(),
        status: 'PENDING', // Can be PENDING, RESOLVED, or IGNORED
      });

      const savedRecord = await this.deadLetterRepository.save(record);
      this.logger.warn(
        `Dead letter recorded: jobId=${payload.jobId}, groupId=${payload.groupId}`,
      );

      // Emit notification to admins
      await this.notifyAdmins(payload);

      // Check and handle consecutive failures for the group
      await this.handleConsecutiveFailures(payload.groupId);

      return savedRecord;
    } catch (error) {
      this.logger.error(
        `Failed to record dead letter: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Notify all admins about the dead letter record
   */
  private async notifyAdmins(payload: DeadLetterPayload): Promise<void> {
    try {
      const notificationMessage = this.buildNotificationMessage(payload);

      await this.notificationService.notifyAdmins({
        type: NotificationType.SYSTEM_ALERT,
        title: `Job Failed: ${payload.jobType}`,
        message: notificationMessage,
        severity: 'high',
        metadata: {
          jobId: payload.jobId,
          groupId: payload.groupId,
          jobType: payload.jobType,
          error: payload.error,
          attemptCount: payload.attemptCount,
        },
      });

      this.logger.info(
        `Admin notification sent for dead letter: ${payload.jobId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to notify admins about dead letter: ${error.message}`,
        error.stack,
      );
      // Do not throw - notification failure should not block dead letter recording
    }
  }

  /**
   * Handle consecutive failures and trigger circuit breaker
   */
  private async handleConsecutiveFailures(groupId: string): Promise<void> {
    try {
      // Get current failure count for the group
      const failureCount = await this.getConsecutiveFailureCount(groupId);
      this.failureCountMap.set(groupId, failureCount);

      if (failureCount >= this.maxConsecutiveFailures) {
        await this.pauseQueue(groupId, failureCount);
      }
    } catch (error) {
      this.logger.error(
        `Error handling consecutive failures for group ${groupId}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Get count of consecutive failures for a group
   */
  private async getConsecutiveFailureCount(groupId: string): Promise<number> {
    // Get the last 10 records for this group to check for consecutive failures
    const recentRecords = await this.deadLetterRepository.find({
      where: { groupId },
      order: { recordedAt: 'DESC' },
      take: 10,
    });

    if (recentRecords.length === 0) {
      return 1;
    }

    // Count consecutive failures from the most recent
    let consecutiveCount = 1;
    const now = new Date();
    const timeWindow = 60 * 60 * 1000; // 1 hour window for consecutive failures

    for (let i = 0; i < recentRecords.length - 1; i++) {
      const timeDiff = recentRecords[i].recordedAt.getTime() - recentRecords[i + 1].recordedAt.getTime();
      
      // If failures are within time window and consecutive, increment count
      if (timeDiff < timeWindow) {
        consecutiveCount++;
      } else {
        break;
      }

      if (consecutiveCount >= this.maxConsecutiveFailures) {
        break;
      }
    }

    return consecutiveCount;
  }

  /**
   * Pause the queue for a specific group
   */
  private async pauseQueue(groupId: string, failureCount: number): Promise<void> {
    try {
      this.logger.error(
        `Circuit breaker triggered for groupId=${groupId}. Consecutive failures: ${failureCount}. Queue paused.`,
      );

      // Emit critical alert
      await this.notificationService.notifyAdmins({
        type: NotificationType.SYSTEM_ALERT,
        title: `CRITICAL: Queue Paused - ${groupId}`,
        message: `Queue for group "${groupId}" has been paused due to ${failureCount} consecutive job failures. Immediate investigation required.`,
        severity: 'critical',
        metadata: {
          groupId,
          consecutiveFailures: failureCount,
          maxAllowed: this.maxConsecutiveFailures,
          action: 'QUEUE_PAUSED',
        },
      });

      // Update all pending records for this group to PAUSED status
      await this.deadLetterRepository.update(
        { groupId, status: 'PENDING' },
        { status: 'PAUSED' },
      );

      this.logger.warn(
        `Queue paused for groupId=${groupId}. Failed records marked as PAUSED.`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to pause queue for group ${groupId}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Resume a paused queue
   */
  async resumeQueue(groupId: string): Promise<void> {
    try {
      await this.deadLetterRepository.update(
        { groupId, status: 'PAUSED' },
        { status: 'PENDING' },
      );

      this.failureCountMap.delete(groupId);

      await this.notificationService.notifyAdmins({
        type: NotificationType.SYSTEM_ALERT,
        title: `Queue Resumed - ${groupId}`,
        message: `Queue for group "${groupId}" has been resumed. Monitor for any recurring failures.`,
        severity: 'info',
        metadata: {
          groupId,
          action: 'QUEUE_RESUMED',
        },
      });

      this.logger.info(`Queue resumed for groupId=${groupId}.`);
    } catch (error) {
      this.logger.error(
        `Failed to resume queue for group ${groupId}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get dead letter records with pagination
   */
  async getDeadLetters(
    page: number = 1,
    limit: number = 50,
  ): Promise<{ records: DeadLetterRecord[]; total: number; page: number }> {
    const skip = (page - 1) * limit;

    const [records, total] = await this.deadLetterRepository.findAndCount({
      order: { recordedAt: 'DESC' },
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
   * Get dead letter records for a specific group
   */
  async getDeadLettersByGroup(
    groupId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{ records: DeadLetterRecord[]; total: number; page: number }> {
    const skip = (page - 1) * limit;

    const [records, total] = await this.deadLetterRepository.findAndCount({
      where: { groupId },
      order: { recordedAt: 'DESC' },
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
   * Mark a dead letter record as resolved
   */
  async resolveDeadLetter(recordId: string, notes?: string): Promise<void> {
    await this.deadLetterRepository.update(
      { id: recordId },
      { 
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolutionNotes: notes,
      },
    );

    this.logger.info(`Dead letter record ${recordId} marked as resolved.`);
  }

  /**
   * Build notification message from dead letter payload
   */
  private buildNotificationMessage(payload: DeadLetterPayload): string {
    return `
Job Type: ${payload.jobType}
Job ID: ${payload.jobId}
Group ID: ${payload.groupId}
Attempt Count: ${payload.attemptCount}
Error: ${payload.error}
    `.trim();
  }

  /**
   * Get circuit breaker status for a group
   */
  async getGroupStatus(groupId: string): Promise<{
    groupId: string;
    isPaused: boolean;
    consecutiveFailures: number;
    lastFailure?: Date;
  }> {
    const lastRecord = await this.deadLetterRepository.findOne({
      where: { groupId },
      order: { recordedAt: 'DESC' },
    });

    const consecutiveFailures = this.failureCountMap.get(groupId) || 0;
    const isPaused = lastRecord?.status === 'PAUSED';

    return {
      groupId,
      isPaused,
      consecutiveFailures,
      lastFailure: lastRecord?.recordedAt,
    };
  }
}
