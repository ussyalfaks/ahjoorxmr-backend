import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * RedisService - A typed wrapper around ioredis for clean service interface
 * Provides methods for caching and storing short-lived authentication challenges
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redis: Redis;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD');

    this.redis = new Redis({
      host,
      port,
      password: password || undefined,
      lazyConnect: true,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redis.on('connect', () => {
      this.logger.log(`Connected to Redis at ${host}:${port}`);
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /**
   * Get a value from Redis by key
   * @param key - The Redis key
   * @returns The stored value or null if not found
   */
  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error) {
      this.logger.error(`Error getting key ${key}: ${error}`);
      return null;
    }
  }

  /**
   * Set a value in Redis
   * @param key - The Redis key
   * @param value - The value to store
   * @returns 'OK' if successful
   */
  async set(key: string, value: string): Promise<'OK' | null> {
    try {
      return await this.redis.set(key, value);
    } catch (error) {
      this.logger.error(`Error setting key ${key}: ${error}`);
      return null;
    }
  }

  /**
   * Set a value in Redis with expiration time
   * @param key - The Redis key
   * @param value - The value to store
   * @param ttlSeconds - Time to live in seconds
   * @returns 'OK' if successful
   */
  async setWithExpiry(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<'OK' | null> {
    try {
      return await this.redis.set(key, value, 'EX', ttlSeconds);
    } catch (error) {
      this.logger.error(`Error setting key ${key} with expiry: ${error}`);
      return null;
    }
  }

  /**
   * Delete a key from Redis
   * @param key - The Redis key to delete
   * @returns Number of keys deleted
   */
  async del(key: string): Promise<number> {
    try {
      return await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Error deleting key ${key}: ${error}`);
      return 0;
    }
  }

  /**
   * Check if a key exists in Redis
   * @param key - The Redis key
   * @returns 1 if exists, 0 otherwise
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error checking key ${key}: ${error}`);
      return false;
    }
  }

  /**
   * Get the underlying Redis client for advanced operations
   */
  getClient(): Redis {
    return this.redis;
  }
}
