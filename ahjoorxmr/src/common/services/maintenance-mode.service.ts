import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

export interface MaintenanceModeConfig {
  enabled: boolean;
  message: string;
  retryAfterSeconds: number;
  allowedIps: string[];
}

@Injectable()
export class MaintenanceModeService {
  private readonly logger = new Logger(MaintenanceModeService.name);
  private readonly GLOBAL_KEY = 'maintenance:global';
  private readonly GROUP_KEY_PREFIX = 'maintenance:group:';

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get global maintenance mode configuration
   */
  async getGlobalMaintenanceMode(): Promise<MaintenanceModeConfig | null> {
    try {
      const config = await this.redisService.get<MaintenanceModeConfig>(
        this.GLOBAL_KEY,
      );
      
      // Fallback to environment variable if Redis key doesn't exist
      if (!config) {
        const envEnabled = this.configService.get<string>(
          'MAINTENANCE_MODE',
          'false',
        );
        if (envEnabled === 'true') {
          return {
            enabled: true,
            message: 'Platform is under maintenance',
            retryAfterSeconds: 300,
            allowedIps: [],
          };
        }
      }
      
      return config;
    } catch (error) {
      this.logger.error(
        `Error fetching global maintenance mode: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Get per-group maintenance mode configuration
   */
  async getGroupMaintenanceMode(
    groupId: string,
  ): Promise<MaintenanceModeConfig | null> {
    try {
      const key = `${this.GROUP_KEY_PREFIX}${groupId}`;
      return await this.redisService.get<MaintenanceModeConfig>(key);
    } catch (error) {
      this.logger.error(
        `Error fetching group maintenance mode for ${groupId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Enable/disable global maintenance mode
   */
  async setGlobalMaintenanceMode(
    config: MaintenanceModeConfig,
  ): Promise<void> {
    try {
      if (config.enabled) {
        // Set with a long TTL (24 hours) to ensure it persists
        await this.redisService.set(this.GLOBAL_KEY, config, 86400);
        this.logger.log('Global maintenance mode enabled');
      } else {
        // Delete the key when disabling
        await this.redisService.del(this.GLOBAL_KEY);
        this.logger.log('Global maintenance mode disabled');
      }
    } catch (error) {
      this.logger.error(
        `Error setting global maintenance mode: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Enable/disable per-group maintenance mode
   */
  async setGroupMaintenanceMode(
    groupId: string,
    config: MaintenanceModeConfig,
  ): Promise<void> {
    try {
      const key = `${this.GROUP_KEY_PREFIX}${groupId}`;
      if (config.enabled) {
        // Set with a long TTL (24 hours)
        await this.redisService.set(key, config, 86400);
        this.logger.log(`Group maintenance mode enabled for ${groupId}`);
      } else {
        // Delete the key when disabling
        await this.redisService.del(key);
        this.logger.log(`Group maintenance mode disabled for ${groupId}`);
      }
    } catch (error) {
      this.logger.error(
        `Error setting group maintenance mode for ${groupId}: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Check if an IP is allowed during maintenance (bypass)
   */
  isIpAllowed(ip: string, allowedIps: string[]): boolean {
    return allowedIps.includes(ip) || allowedIps.includes('*');
  }

  /**
   * Get all active maintenance states (global + per-group)
   */
  async getMaintenanceStatus(): Promise<{
    global: MaintenanceModeConfig | null;
    groups: Record<string, MaintenanceModeConfig>;
  }> {
    try {
      const global = await this.getGlobalMaintenanceMode();
      
      // Get all group maintenance keys
      const client = this.redisService.getClient();
      const keys = await client.keys(`${this.GROUP_KEY_PREFIX}*`);
      
      const groups: Record<string, MaintenanceModeConfig> = {};
      for (const key of keys) {
        const groupId = key.replace(this.GROUP_KEY_PREFIX, '');
        const config = await this.redisService.get<MaintenanceModeConfig>(key);
        if (config) {
          groups[groupId] = config;
        }
      }
      
      return { global, groups };
    } catch (error) {
      this.logger.error(
        `Error fetching maintenance status: ${(error as Error).message}`,
      );
      return { global: null, groups: {} };
    }
  }
}
