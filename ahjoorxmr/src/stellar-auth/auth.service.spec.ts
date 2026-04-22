import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as StellarSdk from '@stellar/stellar-sdk';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RedisService } from '../common/redis/redis.service';

const WALLET = StellarSdk.Keypair.random();
const NOW_SECONDS = Math.floor(Date.now() / 1000);

type FnMock = ReturnType<typeof jest.fn>;

type MockRedis = {
  setWithExpiry: FnMock;
  get: FnMock;
  del: FnMock;
  sismember: FnMock;
  sadd: FnMock;
  expire: FnMock;
};

const mockRedis: MockRedis = {
  setWithExpiry: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  sismember: jest.fn(),
  sadd: jest.fn(),
  expire: jest.fn(),
};

const mockUsersService = {
  upsertByWalletAddress:
    jest.fn<
      (walletAddress: string) => Promise<{ id: string; walletAddress: string }>
    >(),
  findByWalletAddress: jest.fn<(walletAddress: string) => Promise<null>>(),
  updateRefreshTokenHash:
    jest.fn<
      (userId: string, refreshTokenHash: string | null) => Promise<void>
    >(),
  incrementTokenVersion: jest.fn<(userId: string) => Promise<number>>(),
};

const mockJwtService = {
  signAsync: jest.fn<(...args: unknown[]) => Promise<string>>(),
  verifyAsync: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, defaultVal?: string) => {
    const cfg: Record<string, string> = {
      CHALLENGE_TTL_SECONDS: '300',
      STELLAR_NETWORK: 'testnet',
      JWT_PRIVATE_KEY: 'private',
      JWT_REFRESH_SECRET: 'refresh',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
    };
    return cfg[key] ?? defaultVal;
  }),
};

function buildChallenge(walletAddress: string, nonce = 'nonce-123'): string {
  return `Sign this message to authenticate with Cheese Platform.\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${Date.now()}`;
}

function buildSignedEnvelope(
  signer: StellarSdk.Keypair,
  minTime: number,
  maxTime: number,
): string {
  const account = new StellarSdk.Account(signer.publicKey(), '1');
  const tx = new StellarSdk.TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: StellarSdk.Networks.TESTNET,
    timebounds: { minTime, maxTime },
  })
    .addOperation(
      StellarSdk.Operation.manageData({
        name: 'auth',
        value: 'ok',
      }),
    )
    .build();

  tx.sign(signer);
  return tx.toEnvelope().toXDR('base64');
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('rejects expired nonce when challenge is missing in Redis', async () => {
    const challenge = buildChallenge(WALLET.publicKey());
    const envelope = buildSignedEnvelope(
      WALLET,
      NOW_SECONDS - 5,
      NOW_SECONDS + 30,
    );

    mockRedis.get.mockResolvedValue(null);

    await expect(
      service.verifySignature(WALLET.publicKey(), envelope, challenge),
    ).rejects.toThrow(
      new UnauthorizedException('Challenge expired or not found'),
    );
  });

  it('rejects replayed nonce and logs attempt', async () => {
    const challenge = buildChallenge(WALLET.publicKey(), 'replay-me');
    const envelope = buildSignedEnvelope(
      WALLET,
      NOW_SECONDS - 5,
      NOW_SECONDS + 30,
    );
    const loggerSpy = jest
      .spyOn((service as any).logger, 'warn')
      .mockImplementation(() => undefined);

    mockRedis.get.mockResolvedValue(challenge);
    mockRedis.sismember.mockResolvedValue(true);

    await expect(
      service.verifySignature(WALLET.publicKey(), envelope, challenge),
    ).rejects.toThrow(
      new UnauthorizedException('Challenge nonce has already been used'),
    );

    expect(loggerSpy).toHaveBeenCalled();
  });

  it('rejects invalid timebounds before signature verification', async () => {
    const challenge = buildChallenge(WALLET.publicKey(), 'old-nonce');
    const envelope = buildSignedEnvelope(
      WALLET,
      NOW_SECONDS - 300,
      NOW_SECONDS - 120,
    );

    mockRedis.get.mockResolvedValue(challenge);
    mockRedis.sismember.mockResolvedValue(false);

    await expect(
      service.verifySignature(WALLET.publicKey(), envelope, challenge),
    ).rejects.toThrow(/timebounds are outside/);
  });

  it('accepts valid flow and consumes nonce', async () => {
    const challenge = buildChallenge(WALLET.publicKey(), 'fresh-nonce');
    const envelope = buildSignedEnvelope(
      WALLET,
      NOW_SECONDS - 5,
      NOW_SECONDS + 30,
    );

    mockRedis.get.mockResolvedValue(challenge);
    mockRedis.sismember.mockResolvedValue(false);
    mockRedis.sadd.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(true);
    mockRedis.del.mockResolvedValue(1);

    mockUsersService.upsertByWalletAddress.mockResolvedValue({
      id: 'user-1',
      walletAddress: WALLET.publicKey(),
      tokenVersion: 0,
    });
    mockJwtService.signAsync
      .mockResolvedValueOnce('access-token')
      .mockResolvedValueOnce('refresh-token');
    mockUsersService.updateRefreshTokenHash.mockResolvedValue(undefined);

    const result = await service.verifySignature(
      WALLET.publicKey(),
      envelope,
      challenge,
    );

    expect(result).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    expect(mockRedis.sadd).toHaveBeenCalledWith(
      'auth:used_nonces',
      'fresh-nonce',
    );
    expect(mockRedis.expire).toHaveBeenCalledWith('auth:used_nonces', 300);
    expect(mockRedis.del).toHaveBeenCalledWith(
      `siws:challenge:${WALLET.publicKey()}`,
    );
  });
});
