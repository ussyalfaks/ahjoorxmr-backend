import { Injectable, ServiceUnavailableException, Logger } from '@nestjs/common';
import { MaintenanceModeService, MaintenanceModeConfig } from '../services/maintenance-mode.service';

/**
 * Helper mixin for services that need to check per-group maintenance mode
 * before write operations.
 */
@Injectable()
export class GroupMaintenanceMixin {
  private readonly logger = new Logger('GroupMaintenanceMixin');

  constructor(private readonly maintenanceModeService: MaintenanceModeService) {}

  /**
   * Check if a group is under maintenance and throw 503 if so.
   * Call this before any write operation on a group.
   * 
   * @param groupId - The group ID to check
   * @throws ServiceUnavailableException if the group is under maintenance
   */
  async checkGroupMaintenance(groupId: string): Promise<void> {
    const config = await this.maintenanceModeService.getGroupMaintenanceMode(groupId);
    
    if (config?.enabled) {
      this.logger.warn(`Group ${groupId} is under maintenance`);
      const error = new ServiceUnavailableException({
        statusCode: 503,
        message: config.message,
        retryAfter: config.retryAfterSeconds,
      });
      
      // Set Retry-After header on error response
      // Note: The actual header setting should be handled by the controller/interceptor
      throw error;
    }
  }

  /**
   * Check if a group is under maintenance (non-throwing version).
   * 
   * @param groupId - The group ID to check
   * @returns The maintenance config if enabled, null otherwise
   */
  async getGroupMaintenanceStatus(groupId: string): Promise<MaintenanceModeConfig | null> {
    return this.maintenanceModeService.getGroupMaintenanceMode(groupId);
  }
}