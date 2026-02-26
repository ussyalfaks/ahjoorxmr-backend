import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  SetMetadata,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../redis/redis.service';

export const CACHE_TTL_KEY = 'cacheTTL';
export const CACHE_TTL_METADATA = 'cache:ttl';

/**
 * Custom decorator to set cache TTL for routes
 * @param seconds - Time to live in seconds (default: 60)
 * 
 * @example
 * @Get('users')
 * @CacheTTL(300) // Cache for 5 minutes
 * getUsers() { ... }
 */
export function CacheTTL(seconds: number): MethodDecorator {
  return SetMetadata(CACHE_TTL_METADATA, seconds);
}

/**
 * CacheInterceptor - Caches GET responses for a configurable TTL
 * Uses Redis as the caching backend
 * 
 * Usage: Add @CacheTTL(seconds) decorator to controller methods
 */
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;

    // Only cache GET requests
    if (method !== 'GET') {
      return next.handle();
    }

    // Get TTL from decorator or skip caching
    const ttl = this.reflector.get<number>(
      CACHE_TTL_METADATA,
      context.getHandler(),
    );

    // If no TTL is set, don't cache
    if (!ttl || ttl <= 0) {
      return next.handle();
    }

    const cacheKey = this.getCacheKey(url);

    return of(cacheKey).pipe(
      tap(() => {}),
    );
  }

  private getCacheKey(url: string): string {
    // Create a simple cache key from the URL
    return `cache:${url}`;
  }

  /**
   * Get cached data for a given URL
   */
  async getCached<T>(url: string): Promise<T | null> {
    const cacheKey = this.getCacheKey(url);
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Store data in cache
   */
  async setCached<T>(url: string, data: T, ttl: number): Promise<void> {
    const cacheKey = this.getCacheKey(url);
    await this.redisService.setWithExpiry(cacheKey, JSON.stringify(data), ttl);
  }

  /**
   * Invalidate cache for a specific pattern
   * Call this when relevant data mutations occur (e.g., group updated)
   */
  async invalidateCache(pattern: string): Promise<void> {
    const client = this.redisService.getClient();
    const keys = await client.keys(`cache:*${pattern}*`);
    if (keys.length > 0) {
      await client.del(...keys);
      this.logger.log(`Invalidated ${keys.length} cache keys for pattern: ${pattern}`);
    }
  }

  /**
   * Invalidate all cache
   */
  async invalidateAllCache(): Promise<void> {
    const client = this.redisService.getClient();
    const keys = await client.keys('cache:*');
    if (keys.length > 0) {
      await client.del(...keys);
      this.logger.log(`Invalidated ${keys.length} cache keys`);
    }
  }
}
