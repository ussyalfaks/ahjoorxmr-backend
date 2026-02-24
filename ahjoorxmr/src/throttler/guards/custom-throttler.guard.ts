import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Request } from 'express';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    // Use user ID if authenticated, otherwise use IP
    const user = (req as any).user;
    if (user && user.id) {
      return `user:${user.id}`;
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
  }

  protected async getThrottlerLimit(
    context: ExecutionContext,
  ): Promise<number> {
    const request = context.switchToHttp().getRequest();
    const user = (request as any).user;
    
    // Authenticated users get higher limits
    if (user && user.id) {
      return 200; // 200 requests per minute for authenticated users
    }
    
    return 100; // 100 requests per minute for anonymous users
  }
}
