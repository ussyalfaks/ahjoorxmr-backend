import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ServiceUnavailableException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { MaintenanceModeService } from '../services/maintenance-mode.service';

export const BYPASS_MAINTENANCE_MODE_KEY = 'bypassMaintenanceMode';
export const BLOCK_DURING_MAINTENANCE_KEY = 'blockDuringMaintenance';

/**
 * Decorator to opt a GET endpoint into maintenance mode blocking
 */
export function BlockDuringMaintenance() {
  return (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      // Method decorator
      Reflect.defineMetadata(BLOCK_DURING_MAINTENANCE_KEY, true, descriptor.value);
    } else {
      // Class decorator
      Reflect.defineMetadata(BLOCK_DURING_MAINTENANCE_KEY, true, target);
    }
  };
}

/**
 * Decorator to bypass maintenance mode checks
 */
export function BypassMaintenanceMode() {
  return (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) => {
    if (descriptor) {
      // Method decorator
      Reflect.defineMetadata(BYPASS_MAINTENANCE_MODE_KEY, true, descriptor.value);
    } else {
      // Class decorator
      Reflect.defineMetadata(BYPASS_MAINTENANCE_MODE_KEY, true, target);
    }
  };
}

@Injectable()
export class MaintenanceModeGuard implements CanActivate {
  private readonly logger = new Logger(MaintenanceModeGuard.name);

  constructor(
    private readonly maintenanceModeService: MaintenanceModeService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Check if route has bypass decorator
    const bypassMaintenanceMode = this.reflector.getAllAndOverride<boolean>(
      BYPASS_MAINTENANCE_MODE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (bypassMaintenanceMode) {
      return true;
    }

    const method = request.method.toUpperCase();

    // GET requests are exempt by default unless decorated with @BlockDuringMaintenance()
    const isGetRequest = method === 'GET';
    const blockDuringMaintenance = this.reflector.getAllAndOverride<boolean>(
      BLOCK_DURING_MAINTENANCE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isGetRequest && !blockDuringMaintenance) {
      return true;
    }

    // Check global maintenance mode
    const globalMaintenance =
      await this.maintenanceModeService.getGlobalMaintenanceMode();

    if (globalMaintenance?.enabled) {
      const clientIp = this.getClientIp(request);

      // Check if client IP is in allowed list
      if (
        globalMaintenance.allowedIps &&
        this.maintenanceModeService.isIpAllowed(
          clientIp,
          globalMaintenance.allowedIps,
        )
      ) {
        this.logger.debug(`Allowed IP ${clientIp} bypassed maintenance mode`);
        return true;
      }

      // Block the request with 503
      const error = new ServiceUnavailableException({
        statusCode: 503,
        message: globalMaintenance.message,
        retryAfter: globalMaintenance.retryAfterSeconds,
      });

      // Set Retry-After header
      const response = context.switchToHttp().getResponse();
      response.setHeader(
        'Retry-After',
        globalMaintenance.retryAfterSeconds.toString(),
      );

      throw error;
    }

    return true;
  }

  private getClientIp(request: Request): string {
    // Check X-Forwarded-For header first (for proxied requests)
    const forwarded = request.headers['x-forwarded-for'];
    if (forwarded) {
      return (forwarded as string).split(',')[0].trim();
    }

    // Fall back to socket remote address
    return (
      request.socket.remoteAddress ||
      request.ip ||
      request.connection.remoteAddress ||
      'unknown'
    );
  }
}
