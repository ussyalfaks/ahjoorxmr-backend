import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotificationPreference,
  PreferencesMap,
  ChannelPreference,
  buildDefaultPreferences,
} from './notification-preference.entity';
import { NotificationType } from './notification-type.enum';
import { RedisService } from '../common/redis/redis.service';
import {
  UpdateNotificationPreferencesDto,
  NotificationPreferenceStatsDto,
} from './notification-preference.dto';

const CACHE_TTL = 60; // seconds
const cacheKey = (userId: string) => `notif_prefs:${userId}`;
const VALID_TYPES = new Set<string>(Object.values(NotificationType));

@Injectable()
export class NotificationPreferenceService {
  private readonly logger = new Logger(NotificationPreferenceService.name);

  constructor(
    @InjectRepository(NotificationPreference)
    private readonly repo: Repository<NotificationPreference>,
    private readonly redis: RedisService,
  ) {}

  async getOrCreate(userId: string): Promise<NotificationPreference> {
    const cached = await this.redis.get<PreferencesMap>(cacheKey(userId));
    if (cached) {
      return { userId, preferences: cached } as NotificationPreference;
    }

    let pref = await this.repo.findOne({ where: { userId } });
    if (!pref) {
      pref = this.repo.create({ userId, preferences: buildDefaultPreferences() });
      pref = await this.repo.save(pref);
    }

    await this.redis.set(cacheKey(userId), pref.preferences, CACHE_TTL);
    return pref;
  }

  async seedForUser(userId: string): Promise<void> {
    const exists = await this.repo.findOne({ where: { userId } });
    if (!exists) {
      await this.repo.save(
        this.repo.create({ userId, preferences: buildDefaultPreferences() }),
      );
    }
  }

  async update(
    userId: string,
    dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreference> {
    const unknownKeys = Object.keys(dto.preferences).filter(
      (k) => !VALID_TYPES.has(k),
    );
    if (unknownKeys.length > 0) {
      throw new BadRequestException(
        `Unknown notification types: ${unknownKeys.join(', ')}`,
      );
    }

    let pref = await this.repo.findOne({ where: { userId } });
    if (!pref) {
      pref = this.repo.create({ userId, preferences: buildDefaultPreferences() });
    }

    for (const [type, channels] of Object.entries(dto.preferences)) {
      const existing = pref.preferences[type as NotificationType] ?? {
        inApp: true,
        email: true,
        push: true,
      };
      pref.preferences[type as NotificationType] = { ...existing, ...channels };
    }

    const saved = await this.repo.save(pref);
    await this.redis.del(cacheKey(userId));
    return saved;
  }

  async getChannelPreference(
    userId: string,
    type: NotificationType,
  ): Promise<ChannelPreference> {
    const pref = await this.getOrCreate(userId);
    return pref.preferences[type] ?? { inApp: true, email: true, push: true };
  }

  async invalidateCache(userId: string): Promise<void> {
    await this.redis.del(cacheKey(userId));
  }

  async getStats(): Promise<NotificationPreferenceStatsDto[]> {
    const all = await this.repo.find();
    const totalUsers = all.length;
    if (totalUsers === 0) return [];

    const channels: (keyof ChannelPreference)[] = ['inApp', 'email', 'push'];
    const stats: NotificationPreferenceStatsDto[] = [];

    for (const type of Object.values(NotificationType)) {
      for (const channel of channels) {
        const optedOut = all.filter(
          (p) => p.preferences[type]?.[channel] === false,
        ).length;
        stats.push({
          type,
          channel,
          totalUsers,
          optedOut,
          optOutRate: parseFloat(((optedOut / totalUsers) * 100).toFixed(2)),
        });
      }
    }

    return stats;
  }
}
