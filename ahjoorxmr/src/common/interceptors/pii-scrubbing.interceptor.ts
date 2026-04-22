import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { WinstonLogger } from '../logger/winston.logger';
import { scrubForLog } from '../pii/pii-scrubber';

/**
 * PiiScrubbingInterceptor
 *
 * Registered globally in AppModule. Intercepts every request and scrubs
 * PII from the request body before it can be emitted to any log transport.
 * The scrubbed snapshot is attached to `req.__scrubbedBody` for downstream
 * use (e.g. AuditLogInterceptor).
 */
@Injectable()
export class PiiScrubbingInterceptor implements NestInterceptor {
  constructor(private readonly logger: WinstonLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    if (request?.body && typeof request.body === 'object') {
      request.__scrubbedBody = scrubForLog(request.body);
    }

    return next.handle().pipe(
      tap({
        error: (err) => {
          // Ensure error logs never echo raw request bodies
          if (err?.response?.body) {
            err.response.body = scrubForLog(err.response.body);
          }
        },
      }),
    );
  }
}
