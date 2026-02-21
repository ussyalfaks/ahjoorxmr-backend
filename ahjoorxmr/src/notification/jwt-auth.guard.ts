import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    // Replace with your actual JWT strategy guard
    const request = context.switchToHttp().getRequest();
    return !!request.user;
  }
}
