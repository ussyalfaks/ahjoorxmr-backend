import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * RedisService provides a typed interface for Redis operations.
 * It wraps ioredis and exposes clean methods for caching and session management.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD');

    this.client = new Redis({
      host,
      port,
      password: password || undefined,
      lazyConnect: true,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.client.on('connect', () => {
      this.logger.log(`Connected to Redis at ${host}:${port}`);
    });

    this.client.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
  }

  getClient(): Redis {
    return this.client;
  }

  /**
   * Get a value from Redis by key.
   */
  async get<T = string>(key: string): Promise<T | null> {
    let value: string | null = null;
    try {
      value = await this.client.get(key);
    } catch (error) {
      this.logger.error(
        `Error getting key ${key}: ${(error as Error).message}`,
      );
      return null;
    }

    if (value === null) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  /**
   * Set a value in Redis with optional expiration.
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value);
    try {
      if (ttlSeconds) {
        await this.client.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      this.logger.error(
        `Error setting key ${key}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Set a value in Redis with a specific expiration time (TTL).
   * This is useful for short-lived data like authentication challenges.
   */
  async setWithExpiry(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value);
    try {
      await this.client.set(key, serialized, 'EX', ttlSeconds);
      this.logger.debug(`Set key ${key} with TTL ${ttlSeconds}s`);
    } catch (error) {
      this.logger.error(
        `Error setting key ${key} with expiry: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Set a lock key only when absent, with expiry.
   */
  async setIfNotExistsWithExpiry(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    try {
      const result = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (error) {
      this.logger.error(
        `Error setting NX key ${key}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Delete a key from Redis.
   */
  async del(key: string): Promise<number> {
    try {
      return await this.client.del(key);
    } catch (error) {
      this.logger.error(
        `Error deleting key ${key}: ${(error as Error).message}`,
      );
      return 0;
    }
  }

  /**
   * Delete multiple keys from Redis using a pattern.
   * Useful for cache invalidation (e.g., deleting all keys matching "user:1:*")
   */
  async delByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deletedCount = 0;

    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        deletedCount += await this.client.del(...keys);
      }
    } while (cursor !== '0');

    if (deletedCount > 0) {
      this.logger.debug(
        `Deleted ${deletedCount} keys matching pattern: ${pattern}`,
      );
    }

    return deletedCount;
  }

  /**
   * Check if a key exists in Redis.
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(
        `Error checking key ${key}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Add one or more members to a set.
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.client.sadd(key, ...members);
    } catch (error) {
      this.logger.error(
        `Error adding set members for key ${key}: ${(error as Error).message}`,
      );
      return 0;
    }
  }

  /**
   * Check set membership.
   */
  async sismember(key: string, member: string): Promise<boolean> {
    try {
      return (await this.client.sismember(key, member)) === 1;
    } catch (error) {
      this.logger.error(
        `Error checking set membership for key ${key}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Set expiration time on an existing key.
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      return (await this.client.expire(key, ttlSeconds)) === 1;
    } catch (error) {
      this.logger.error(
        `Error setting expiry for key ${key}: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Get the remaining time-to-live (TTL) of a key.
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      this.logger.error(
        `Error reading TTL for key ${key}: ${(error as Error).message}`,
      );
      return -2;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
