import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as StellarSdk from '@stellar/stellar-sdk';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { RedisService } from '../common/redis/redis.service';

describe('Auth replay protection integration', () => {
  let service: AuthService;

  const wallet = StellarSdk.Keypair.random();
  const challenge = `Sign this message to authenticate with Cheese Platform.\n\nWallet: ${wallet.publicKey()}\nNonce: replay-once\nTimestamp: ${Date.now()}`;
  const now = Math.floor(Date.now() / 1000);

  const used = new Set<string>();
  const redisState = new Map<string, string>([
    [`siws:challenge:${wallet.publicKey()}`, challenge],
  ]);

  const redisMock = {
    setWithExpiry: jest.fn(async (key: string, value: string) => {
      redisState.set(key, value);
    }),
    get: jest.fn(async (key: string) => redisState.get(key) ?? null),
    del: jest.fn(async (key: string) => {
      redisState.delete(key);
      return 1;
    }),
    sadd: jest.fn(async (_key: string, nonce: string) => {
      used.add(nonce);
      return 1;
    }),
    sismember: jest.fn(async (_key: string, nonce: string) => used.has(nonce)),
    expire: jest.fn(async () => true),
  };

  const usersMock = {
    upsertByWalletAddress: jest.fn(async () => ({
      id: 'user-1',
      walletAddress: wallet.publicKey(),
    })),
    updateRefreshTokenHash: jest.fn(async () => undefined),
    findByWalletAddress: jest.fn(async () => null),
  };

  const jwtMock = {
    signAsync: jest
      .fn<(...args: unknown[]) => Promise<string>>()
      .mockResolvedValueOnce('access-1')
      .mockResolvedValueOnce('refresh-1'),
    verifyAsync: jest.fn(),
  };

  const configMock = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const cfg: Record<string, string> = {
        CHALLENGE_TTL_SECONDS: '300',
        STELLAR_NETWORK: 'testnet',
        JWT_PRIVATE_KEY: 'private',
        JWT_REFRESH_SECRET: 'refresh',
      };
      return cfg[key] ?? defaultValue;
    }),
  };

  function buildEnvelope(): string {
    const account = new StellarSdk.Account(wallet.publicKey(), '1');
    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: StellarSdk.Networks.TESTNET,
      timebounds: { minTime: now - 5, maxTime: now + 30 },
    })
      .addOperation(
        StellarSdk.Operation.manageData({ name: 'auth', value: 'ok' }),
      )
      .build();

    tx.sign(wallet);
    return tx.toEnvelope().toXDR('base64');
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('blocks replay after a successful login', async () => {
    const envelope = buildEnvelope();

    const first = await service.verifySignature(
      wallet.publicKey(),
      envelope,
      challenge,
    );
    expect(first).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });

    redisState.set(`siws:challenge:${wallet.publicKey()}`, challenge);

    await expect(
      service.verifySignature(wallet.publicKey(), envelope, challenge),
    ).rejects.toThrow(
      new UnauthorizedException('Challenge nonce has already been used'),
    );
  });
});
