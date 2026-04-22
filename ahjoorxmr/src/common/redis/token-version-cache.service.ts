import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

const KEY_PREFIX = 'tokver:';
const DEFAULT_TTL_SECONDS = 30;

/**
 * Short-lived cache of userId → tokenVersion to reduce DB reads on JwtStrategy.validate.
 * Invalidated whenever UsersService revokes or rotates sessions.
 */
@Injectable()
export class TokenVersionCacheService {
  constructor(private readonly redis: RedisService) {}

  private key(userId: string): string {
    return `${KEY_PREFIX}${userId}`;
  }

  async get(userId: string): Promise<number | null> {
    const raw = await this.redis.get<string>(this.key(userId));
    if (raw === null || raw === undefined) {
      return null;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  async set(userId: string, version: number, ttlSeconds = DEFAULT_TTL_SECONDS): Promise<void> {
    await this.redis.set(this.key(userId), String(version), ttlSeconds);
  }

  async invalidate(userId: string): Promise<void> {
    await this.redis.del(this.key(userId));
  }
}
