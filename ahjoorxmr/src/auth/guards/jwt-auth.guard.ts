import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';

/**
 * JWT authentication guard.
 * TODO: Replace with full JWT validation once the auth module is wired up.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const authHeader = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid authorization header');
    }

    const token = authHeader.substring(7);
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(token)) {
      throw new UnauthorizedException('Invalid JWT token');
    }

    request.user = { id: token, userId: token };
    return true;
  }
}
