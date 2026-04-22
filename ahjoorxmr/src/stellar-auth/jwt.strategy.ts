import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { TokenVersionCacheService } from '../common/redis/token-version-cache.service';

export interface JwtPayload {
  sub: string;
  walletAddress: string;
  tokenVersion?: number;
}

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
      secretOrKey: configService.get<string>('JWT_PUBLIC_KEY'),
      algorithms: ['RS256'],
    });
  }

  async validate(payload: JwtPayload) {
    const tokenV = payload.tokenVersion ?? 0;
    const cachedVersion = await this.tokenVersionCache.get(payload.sub);
    if (cachedVersion !== null && cachedVersion !== tokenV) {
      throw new UnauthorizedException(
        'Token version mismatch - session revoked',
      );
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (tokenV !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException(
        'Token version mismatch - session revoked',
      );
    }

    await this.tokenVersionCache.set(user.id, user.tokenVersion ?? 0);

    return {
      id: user.id,
      walletAddress: user.walletAddress,
      role: user.role,
    };
  }
}
