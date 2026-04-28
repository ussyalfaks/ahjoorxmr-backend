import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from '../decorators/require-key-scope.decorator';
import { KeyScope } from '../key-scope.enum';

@Injectable()
export class KeyScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<KeyScope[]>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    
    // If user is authenticated via JWT (req.user exists but no scopes), 
    // we assume it's a full-access session for now or handled by other guards.
    // If it's an API Key session, req.user.scopes will exist.
    if (!user) {
      return false;
    }

    // If scopes is undefined, it might be a legacy key or a JWT session.
    // Acceptance Criteria: Existing keys without scopes continue to work (treated as full-access).
    if (!user.scopes) {
      return true;
    }

    const userScopes: string[] = user.scopes;
    
    // Check if user has ALL required scopes (or is ADMIN)
    if (userScopes.includes(KeyScope.ADMIN)) {
      return true;
    }

    const hasAllScopes = requiredScopes.every((scope) => userScopes.includes(scope));
    
    if (!hasAllScopes) {
      throw new ForbiddenException(
        `Insufficient API key scopes. Required: [${requiredScopes.join(', ')}]`,
      );
    }

    return true;
  }
}
