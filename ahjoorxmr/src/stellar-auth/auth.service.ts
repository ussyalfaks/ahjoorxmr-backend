import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as StellarSdk from '@stellar/stellar-sdk';
import { RedisService } from '../common/redis/redis.service';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly challengeTtlSeconds: number;
  private readonly CHALLENGE_PREFIX = 'siws:challenge:';
  private readonly USED_NONCES_SET_KEY = 'auth:used_nonces';
  private readonly TIMEBOUND_SKEW_SECONDS = 30;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.challengeTtlSeconds = Number(
      this.configService.get<string>('CHALLENGE_TTL_SECONDS', '300'),
    );
  }

  async generateChallenge(walletAddress: string): Promise<string> {
    const nonce = crypto.randomBytes(32).toString('hex');
    const timestamp = Date.now();
    const challenge = `Sign this message to authenticate with Cheese Platform.\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

    const redisKey = `${this.CHALLENGE_PREFIX}${walletAddress}`;
    await this.redisService.setWithExpiry(
      redisKey,
      challenge,
      this.challengeTtlSeconds,
    );

    return challenge;
  }

  async verifySignature(
    walletAddress: string,
    signedEnvelopeXdr: string,
    challenge: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const redisKey = `${this.CHALLENGE_PREFIX}${walletAddress}`;
    const storedChallenge = await this.redisService.get<string>(redisKey);

    if (!storedChallenge) {
      throw new UnauthorizedException('Challenge expired or not found');
    }

    if (storedChallenge !== challenge) {
      throw new UnauthorizedException('Challenge mismatch');
    }

    const nonce = this.extractNonceFromChallenge(challenge);
    const replayed = await this.redisService.sismember(
      this.USED_NONCES_SET_KEY,
      nonce,
    );
    if (replayed) {
      this.logger.warn(
        JSON.stringify({
          event: 'auth_replay_detected',
          walletAddress,
          nonce,
          timestamp: new Date().toISOString(),
        }),
      );
      throw new UnauthorizedException('Challenge nonce has already been used');
    }

    this.validateEnvelopeTimebounds(signedEnvelopeXdr);

    const isValid = this.verifyEnvelopeSignature(
      walletAddress,
      signedEnvelopeXdr,
    );
    if (!isValid) {
      throw new UnauthorizedException('Invalid signature');
    }

    await this.redisService.sadd(this.USED_NONCES_SET_KEY, nonce);
    await this.redisService.expire(
      this.USED_NONCES_SET_KEY,
      this.challengeTtlSeconds,
    );

    await this.redisService.del(redisKey);

    // Upsert user
    const user = await this.usersService.upsertByWalletAddress(walletAddress);

    // Issue tokens (embed current tokenVersion for session revocation checks)
    const tokens = await this.issueTokens(
      user.id,
      walletAddress,
      user.tokenVersion ?? 0,
    );

    // Store refresh token hash
    const refreshTokenHash = this.hashToken(tokens.refreshToken);
    await this.usersService.updateRefreshTokenHash(user.id, refreshTokenHash);

    return tokens;
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string }> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findByWalletAddress(
      payload.walletAddress,
    );
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    const tokenHash = this.hashToken(refreshToken);
    if (tokenHash !== user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token mismatch');
    }

    const accessToken = await this.issueAccessToken(
      user.id,
      user.walletAddress,
      user.tokenVersion ?? 0,
    );
    return { accessToken };
  }

  async logout(walletAddress: string): Promise<void> {
    const user = await this.usersService.findByWalletAddress(walletAddress);
    if (user) {
      await this.usersService.updateRefreshTokenHash(user.id, null);
      await this.usersService.incrementTokenVersion(user.id);
    }
  }

  private verifyEnvelopeSignature(
    walletAddress: string,
    signedEnvelopeXdr: string,
  ): boolean {
    try {
      const keyPair = StellarSdk.Keypair.fromPublicKey(walletAddress);
      const transaction = StellarSdk.TransactionBuilder.fromXDR(
        signedEnvelopeXdr,
        this.getNetworkPassphrase(),
      ) as StellarSdk.Transaction;

      const txHash = transaction.hash();
      const signatures = transaction.signatures ?? [];
      const hint = keyPair.signatureHint();

      for (const decoratedSignature of signatures) {
        const signatureHint = decoratedSignature.hint();
        if (!hint.equals(signatureHint)) {
          continue;
        }

        if (keyPair.verify(txHash, decoratedSignature.signature())) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  private validateEnvelopeTimebounds(signedEnvelopeXdr: string): void {
    let transaction: StellarSdk.Transaction;
    try {
      transaction = StellarSdk.TransactionBuilder.fromXDR(
        signedEnvelopeXdr,
        this.getNetworkPassphrase(),
      ) as StellarSdk.Transaction;
    } catch {
      throw new UnauthorizedException(
        'Invalid transaction envelope: unable to parse signed envelope XDR',
      );
    }

    const timeBounds = transaction.timeBounds;
    if (!timeBounds) {
      throw new UnauthorizedException(
        'Invalid transaction envelope: missing timebounds',
      );
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const minTime = Number(timeBounds.minTime);
    const maxTime = Number(timeBounds.maxTime);

    if (
      nowSeconds < minTime - this.TIMEBOUND_SKEW_SECONDS ||
      nowSeconds > maxTime + this.TIMEBOUND_SKEW_SECONDS
    ) {
      throw new UnauthorizedException(
        `Transaction envelope timebounds are outside the allowed +/-${this.TIMEBOUND_SKEW_SECONDS}s clock skew`,
      );
    }
  }

  private extractNonceFromChallenge(challenge: string): string {
    const match = challenge.match(/\nNonce:\s*([^\n]+)/i);
    if (!match?.[1]) {
      throw new UnauthorizedException(
        'Invalid challenge format: nonce missing',
      );
    }
    return match[1].trim();
  }

  private getNetworkPassphrase(): string {
    const configured = this.configService.get<string>(
      'STELLAR_NETWORK_PASSPHRASE',
    );
    if (configured) {
      return configured;
    }

    const network = (
      this.configService.get<string>('STELLAR_NETWORK', 'testnet') ?? 'testnet'
    ).toLowerCase();

    return network === 'mainnet'
      ? StellarSdk.Networks.PUBLIC
      : StellarSdk.Networks.TESTNET;
  }

  private async issueTokens(
    userId: string,
    walletAddress: string,
    tokenVersion: number,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const [accessToken, refreshToken] = await Promise.all([
      this.issueAccessToken(userId, walletAddress, tokenVersion),
      this.issueRefreshToken(userId, walletAddress, tokenVersion),
    ]);
    return { accessToken, refreshToken };
  }

  private async issueAccessToken(
    userId: string,
    walletAddress: string,
    tokenVersion: number,
  ): Promise<string> {
    const payload: JwtPayload = { sub: userId, walletAddress, tokenVersion };
    return this.jwtService.signAsync(payload, {
      privateKey: this.configService.get<string>('JWT_PRIVATE_KEY'),
      algorithm: 'RS256',
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    });
  }

  private async issueRefreshToken(
    userId: string,
    walletAddress: string,
    tokenVersion: number,
  ): Promise<string> {
    const payload: JwtPayload = { sub: userId, walletAddress, tokenVersion };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      algorithm: 'HS256',
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
