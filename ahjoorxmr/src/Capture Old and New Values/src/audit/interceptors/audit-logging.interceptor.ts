import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { AuditLogService } from '../services/audit-log.service';
import {
  AUDIT_LOG_METADATA_KEY,
  AuditLogOptions,
} from '../decorators/audit-log.decorator';

// Sensitive fields to exclude from audit logs
const SENSITIVE_FIELDS = [
  'password',
  'refreshTokenHash',
  'refreshToken',
  'resetToken',
  'secretKey',
  'apiKey',
];

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email?: string;
    [key: string]: any;
  };
}

@Injectable()
export class AuditLoggingInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private auditLogService: AuditLogService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    // Get audit log metadata from the handler
    const auditOptions = this.reflector.get<AuditLogOptions>(
      AUDIT_LOG_METADATA_KEY,
      context.getHandler(),
    );

    // If no audit metadata, skip
    if (!auditOptions) {
      return next.handle();
    }

    const startTime = Date.now();
    const userId = request.user?.id || 'system';
    const ipAddress = this.getIpAddress(request);
    const endpoint = `${request.method} ${request.path}`;
    const method = request.method;

    // Capture initial data
    let previousValue: Record<string, any> | null = null;
    let resourceId: string = null;

    // For PATCH/PUT requests, we need to fetch the current state
    if (
      (method === 'PATCH' || method === 'PUT') &&
      context.switchToHttp().getArgByIndex(0)
    ) {
      resourceId = request.params.id || null;
      if (resourceId && context.getClass().name.includes('Controller')) {
        // Store original body for later reference if needed
        previousValue = { ...request.body };
      }
    }

    // For POST requests, previous value is null
    if (method === 'POST') {
      resourceId = null;
    }

    // Capture new value (request body)
    let newValue: Record<string, any> | null = null;
    if (['POST', 'PATCH', 'PUT'].includes(method) && request.body) {
      newValue = this.sanitizeData(request.body, auditOptions.excludeFields);
    }

    return next.handle().pipe(
      tap(
        async (response_data) => {
          // Extract resourceId from response if available
          if (!resourceId && response_data?.id) {
            resourceId = response_data.id;
          }

          try {
            await this.auditLogService.create({
              userId,
              action: auditOptions.action,
              resource: auditOptions.resource,
              resourceId: resourceId || 'unknown',
              previousValue,
              newValue,
              endpoint,
              method,
              ipAddress,
              statusCode: response.statusCode || 200,
            });
          } catch (error) {
            // Log audit error but don't break the request
            console.error('Failed to create audit log:', error);
          }
        },
        async (error) => {
          // Log failed actions too
          try {
            await this.auditLogService.create({
              userId,
              action: auditOptions.action,
              resource: auditOptions.resource,
              resourceId: resourceId || 'unknown',
              previousValue,
              newValue,
              endpoint,
              method,
              ipAddress,
              statusCode: response.statusCode || 500,
              errorMessage: error?.message || 'Unknown error',
            });
          } catch (auditError) {
            console.error('Failed to create audit log for error:', auditError);
          }
        },
      ),
    );
  }

  /**
   * Sanitize data by removing sensitive fields
   */
  private sanitizeData(
    data: Record<string, any>,
    customExcludeFields?: string[],
  ): Record<string, any> {
    const excludeFields = [...SENSITIVE_FIELDS, ...(customExcludeFields || [])];

    const sanitized = { ...data };

    excludeFields.forEach((field) => {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Extract IP address from request
   */
  private getIpAddress(request: AuthenticatedRequest): string {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
      request.socket?.remoteAddress ||
      'unknown'
    );
  }
}
