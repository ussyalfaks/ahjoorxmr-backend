import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import { NotificationType } from '../enums/notification-type.enum';

export interface NotifyPayload {
  userId: string;
  type: NotificationType;
  metadata: Record<string, unknown>;
  /**
   * When supplied, the call is a no-op if a notification with this key
   * already exists in the database (idempotency guard).
   */
  idempotencyKey?: string;
}

export interface NotifyResult {
  /** `true` when a new record was persisted; `false` when deduplicated. */
  created: boolean;
  notification?: Notification;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  /**
   * Persists a notification record and would dispatch a push / e-mail /
   * in-app message via your delivery provider here.
   *
   * Returns `{ created: false }` when the idempotency key already exists,
   * so callers can safely call this method on every scheduler tick without
   * fear of spamming users.
   */
  async notify(payload: NotifyPayload): Promise<NotifyResult> {
    const { userId, type, metadata, idempotencyKey } = payload;

    // Fast-path: check existence before attempting insert to avoid relying
    // solely on a catch-and-swallow pattern.
    if (idempotencyKey) {
      const existing = await this.notificationRepo.findOne({
        where: { idempotencyKey },
      });
      if (existing) {
        this.logger.debug(
          `Duplicate suppressed — idempotencyKey=${idempotencyKey}`,
        );
        return { created: false, notification: existing };
      }
    }

    const notification = this.notificationRepo.create({
      userId,
      type,
      metadata,
      idempotencyKey,
    });

    try {
      const saved = await this.notificationRepo.save(notification);
      this.logger.log(`Notification persisted: ${saved.id} (${type})`);

      // TODO: dispatch real delivery (push, email, etc.) here.

      return { created: true, notification: saved };
    } catch (err) {
      // Unique-constraint violation means a concurrent request beat us to it.
      if (
        err instanceof QueryFailedError &&
        (err as any).code === '23505' // Postgres unique violation
      ) {
        this.logger.debug(
          `Race-condition dedup — idempotencyKey=${idempotencyKey}`,
        );
        return { created: false };
      }
      throw err;
    }
  }
}
