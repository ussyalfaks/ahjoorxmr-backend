import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RedisService } from '../redis/redis.service';

export const REQUIRES_IDEMPOTENCY_KEY = 'requires_idempotency';

/**
 * Decorator to mark endpoints that require idempotency key
 * Usage: @RequiresIdempotency()
 */
export function RequiresIdempotency() {
  return (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) => {
    Reflect.defineMetadata(REQUIRES_IDEMPOTENCY_KEY, true, descriptor.value);
    return descriptor;
  };
}

/**
 * Interface for cached idempotent response
 */
interface CachedResponse {
  statusCode: number;
  body: unknown;
  headers?: Record<string, string>;
  timestamp: string;
}

/**
 * IdempotencyInterceptor enforces idempotency for POST requests using Redis cache.
 *
 * How it works:
 * 1. Reads Idempotency-Key header (must be UUID v4)
 * 2. On first request: processes normally, caches response for 24 hours
 * 3. On duplicate request: returns cached response immediately
 * 4. Returns 400 if key is missing on endpoints marked with @RequiresIdempotency()
 *
 * Cache key format: idempotency:{key}
 * TTL: 24 hours (86400 seconds)
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  private readonly IDEMPOTENCY_TTL = 86400; // 24 hours in seconds
  private readonly UUID_V4_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const handler = context.getHandler();

    // Only apply to POST requests
    if (request.method !== 'POST') {
      return next.handle();
    }

    // Check if endpoint requires idempotency key
    const requiresIdempotency = Reflect.getMetadata(
      REQUIRES_IDEMPOTENCY_KEY,
      handler,
    );

    const idempotencyKey = request.headers['idempotency-key'] as
      | string
      | undefined;

    // If endpoint requires idempotency key and it's missing, return 400
    if (requiresIdempotency && !idempotencyKey) {
      throw new BadRequestException(
        'Idempotency-Key header is required for this endpoint',
      );
    }

    // If no idempotency key provided, proceed normally
    if (!idempotencyKey) {
      return next.handle();
    }

    // Validate idempotency key format (must be UUID v4)
    if (!this.UUID_V4_REGEX.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key must be a valid UUID v4');
    }

    const cacheKey = `idempotency:${idempotencyKey}`;

    // Try to get cached response
    const cachedResponseStr = await this.redisService.get(cacheKey);

    if (cachedResponseStr) {
      // Cache hit - return cached response
      this.logger.log(
        `Idempotency cache HIT for key: ${idempotencyKey} (${request.method} ${request.url})`,
      );

      try {
        const cachedResponse: CachedResponse = JSON.parse(cachedResponseStr);

        // Set cached headers if any
        if (cachedResponse.headers) {
          Object.entries(cachedResponse.headers).forEach(([key, value]) => {
            response.setHeader(key, value);
          });
        }

        // Set X-Idempotency-Replay header to indicate this is a cached response
        response.setHeader('X-Idempotency-Replay', 'true');
        response.status(cachedResponse.statusCode);

        return of(cachedResponse.body);
      } catch (error) {
        this.logger.error(
          `Failed to parse cached idempotency response for key ${idempotencyKey}: ${error.message}`,
        );
        // If cache is corrupted, proceed with normal request
      }
    }

    // Cache miss - proceed with request and cache the response
    this.logger.log(
      `Idempotency cache MISS for key: ${idempotencyKey} (${request.method} ${request.url})`,
    );

    return next.handle().pipe(
      tap(async (data) => {
        // Cache the successful response
        const cachedResponse: CachedResponse = {
          statusCode: response.statusCode,
          body: data,
          timestamp: new Date().toISOString(),
        };

        try {
          await this.redisService.setWithExpiry(
            cacheKey,
            JSON.stringify(cachedResponse),
            this.IDEMPOTENCY_TTL,
          );

          this.logger.log(
            `Cached idempotent response for key: ${idempotencyKey} with TTL: ${this.IDEMPOTENCY_TTL}s`,
          );
        } catch (error) {
          this.logger.error(
            `Failed to cache idempotent response for key ${idempotencyKey}: ${error.message}`,
          );
          // Don't fail the request if caching fails
        }
      }),
      catchError((error) => {
        // Don't cache error responses
        this.logger.warn(
          `Request with idempotency key ${idempotencyKey} failed, not caching error response`,
        );
        throw error;
      }),
    );
  }
}
