import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit.service';
import {
  AUDIT_LOG_KEY,
  AuditLogOptions,
} from '../decorators/audit-log.decorator';
import { scrubForAudit } from '../../common/pii/pii-scrubber';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly hmacSecret: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {
    this.hmacSecret =
      this.configService.get<string>('PII_HMAC_SECRET') ?? 'changeme';
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditOptions = this.reflector.get<AuditLogOptions>(
      AUDIT_LOG_KEY,
      context.getHandler(),
    );

    if (!auditOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const ipAddress = request.ip || request.connection?.remoteAddress;
    const userAgent = request.headers['user-agent'];

    return next.handle().pipe(
      tap(() => {
        // Use the pre-scrubbed body attached by PiiScrubbingInterceptor when
        // available; otherwise fall back to scrubbing the raw body now.
        const rawBody = request.body ?? {};
        const auditPayload = scrubForAudit(rawBody, this.hmacSecret);

        this.auditService.createLog({
          userId: user?.id || user?.sub,
          action: auditOptions.action,
          resource: auditOptions.resource,
          metadata: {
            method: request.method,
            url: request.url,
            params: request.params,
            query: request.query,
          },
          ipAddress,
          userAgent,
          requestPayload: auditPayload,
        });
      }),
    );
  }
}
