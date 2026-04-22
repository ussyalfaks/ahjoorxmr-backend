import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { TokenVersionCacheService } from '../../common/redis/token-version-cache.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly tokenVersionCache: TokenVersionCacheService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_ACCESS_SECRET') ||
        'default_access_secret',
    });
  }

  async validate(payload: any) {
    const tokenV = payload.tokenVersion ?? 0;
    const userIdFromJwt = payload.userId as string | undefined;

    if (userIdFromJwt) {
      const cachedVersion = await this.tokenVersionCache.get(userIdFromJwt);
      if (cachedVersion !== null && cachedVersion !== tokenV) {
        throw new UnauthorizedException(
          'Token version mismatch - session revoked',
        );
      }
    }

    const user = await this.usersService.findByWalletAddress(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }

    if (tokenV !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException(
        'Token version mismatch - session revoked',
      );
    }

    await this.tokenVersionCache.set(user.id, user.tokenVersion ?? 0);

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      walletAddress: user.walletAddress,
    };
  }
}
