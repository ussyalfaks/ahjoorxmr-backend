import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response } from 'express';

@Injectable()
export class RateLimitHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<Response>();
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      tap(() => {
        // Add rate limit headers
        const rateLimitInfo = (request as any).rateLimit;
        
        if (rateLimitInfo) {
          response.setHeader('X-RateLimit-Limit', rateLimitInfo.limit || 100);
          response.setHeader(
            'X-RateLimit-Remaining',
            Math.max(0, (rateLimitInfo.limit || 100) - (rateLimitInfo.current || 0)),
          );
          response.setHeader(
            'X-RateLimit-Reset',
            rateLimitInfo.resetTime || Date.now() + 60000,
          );
        }
      }),
    );
  }
}
