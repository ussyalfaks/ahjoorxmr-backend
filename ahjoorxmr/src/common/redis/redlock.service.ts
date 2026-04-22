import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redlock, { Lock } from 'redlock';
import { RedisService } from './redis.service';

@Injectable()
export class RedlockService {
  private readonly logger = new Logger(RedlockService.name);
  private readonly redlock: Redlock;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    const retryCount = Number(
      this.configService.get<string>('MEDIATION_LOCK_RETRY_COUNT', '0'),
    );

    this.redlock = new Redlock([this.redisService.getClient()], {
      retryCount,
    });

    this.redlock.on('error', (error) => {
      this.logger.warn(`Redlock error: ${error.message}`);
    });
  }

  async acquire(resourceKey: string, ttlMs: number): Promise<Lock | null> {
    try {
      return await this.redlock.acquire([resourceKey], ttlMs);
    } catch (error) {
      this.logger.warn(
        `Failed to acquire redlock for ${resourceKey}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  async release(lock: Lock | null): Promise<void> {
    if (!lock) {
      return;
    }

    try {
      await lock.release();
    } catch (error) {
      this.logger.warn(
        `Failed to release redlock: ${(error as Error).message}`,
      );
    }
  }
}
