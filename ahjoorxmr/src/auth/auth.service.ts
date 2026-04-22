import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { TwoFactorService } from './two-factor.service';
import { StellarService } from '../stellar/stellar.service';
import { RefreshToken } from './entities/refresh-token.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly twoFactorService: TwoFactorService,
    private readonly stellarService: StellarService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  async registerWithWallet(
    walletAddress: string,
    signature: string,
    challenge: string,
  ) {
    const isValid = this.stellarService.verifySignature(
      walletAddress,
      challenge,
      signature,
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid signature');
    }

    let user = await this.usersService.findByWalletAddress(walletAddress);
    if (!user) {
      user = await this.usersService.create({
        walletAddress,
        role: 'user',
        isActive: true,
      });
    }

    const tokens = await this.generateTokens(
      user.walletAddress,
      user.email || '',
      user.role,
    );
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async register(registerDto: RegisterDto) {
    const { email, password, firstName, lastName } = registerDto;

    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await this.hashPassword(password);
    const user = await this.usersService.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      walletAddress: `internal-${Date.now()}`,
      role: 'user',
    });

    const tokens = await this.generateTokens(
      user.walletAddress,
      user.email || '',
      user.role,
    );
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const user = await this.usersService.findByEmail(email);

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.twoFactorEnabled) {
      const preAuthToken = this.twoFactorService.issuePreAuthToken(
        user.id,
        user.email ?? '',
        user.role,
      );
      throw new ForbiddenException({
        message: '2FA verification required',
        preAuthToken,
        twoFactorRequired: true,
      });
    }

    const tokens = await this.generateTokens(
      user.walletAddress,
      user.email || '',
      user.role,
    );
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  /**
   * Rotates the refresh token: verifies the incoming token hash exists and is
   * not revoked, marks it revoked, then issues a new access + refresh pair.
   * Reuse of a rotated token returns 401 Unauthorized.
   */
  async refreshTokens(incomingRefreshToken: string) {
    // Verify JWT signature first
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(incomingRefreshToken, {
        secret:
          this.configService.get<string>('JWT_REFRESH_SECRET') ||
          'default_refresh_secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.hashToken(incomingRefreshToken);

    const stored = await this.refreshTokenRepository.findOne({
      where: { tokenHash },
    });

    if (!stored || stored.revokedAt !== null || stored.expiresAt < new Date()) {
      // Possible token reuse — revoke all tokens for this user
      if (stored?.userId) {
        await this.revokeAllUserTokens(stored.userId);
      }
      throw new UnauthorizedException('Access Denied');
    }

    // Rotate: revoke old token
    stored.revokedAt = new Date();
    await this.refreshTokenRepository.save(stored);

    const user = await this.usersService.findById(stored.userId);
    const newTokenVersion = await this.usersService.incrementTokenVersion(user.id);

    const tokens = await this.generateTokens(
      user.walletAddress,
      user.email || '',
      user.role,
      newTokenVersion,
    );
    await this.storeRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  /**
   * Revokes the current refresh token immediately (logout).
   */
  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.refreshTokenRepository.update({ tokenHash }, { revokedAt: new Date() });
    } else {
      await this.revokeAllUserTokens(userId);
    }
    await this.usersService.revokeAllSessions(userId);
  }

  /**
   * Admin: revoke all refresh tokens for a given user (force sign-out).
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, revokedAt: null as any },
      { revokedAt: new Date() },
    );
    await this.usersService.revokeAllSessions(userId);
  }

  /**
   * Cleanup job: delete expired refresh token rows.
   * Called by the daily BullMQ/scheduler job.
   */
  async deleteExpiredTokens(): Promise<number> {
    const result = await this.refreshTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected ?? 0;
  }

  async verifyRefreshToken(token: string) {
    return this.jwtService.verifyAsync(token, {
      secret:
        this.configService.get<string>('JWT_REFRESH_SECRET') ||
        'default_refresh_secret',
    });
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async getUserForTokenGeneration(userId: string) {
    return this.usersService.findById(userId);
  }

  async generateTokens(
    sub: string,
    email: string,
    role: string,
    tokenVersion?: number,
  ) {
    const user = await this.usersService.findByWalletAddress(sub);
    const version = tokenVersion ?? user.tokenVersion ?? 0;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub, userId: user.id, email, role, tokenVersion: version },
        {
          secret:
            this.configService.get<string>('JWT_ACCESS_SECRET') ||
            'default_access_secret',
          expiresIn: '15m',
        },
      ),
      this.jwtService.signAsync(
        { sub, userId: user.id, email, role, tokenVersion: version },
        {
          secret:
            this.configService.get<string>('JWT_REFRESH_SECRET') ||
            'default_refresh_secret',
          expiresIn: '7d',
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  /** @deprecated Use storeRefreshToken instead */
  async updateRefreshToken(userId: string, refreshToken: string) {
    await this.storeRefreshToken(userId, refreshToken);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async storeRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const record = this.refreshTokenRepository.create({ userId, tokenHash, expiresAt });
    await this.refreshTokenRepository.save(record);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
