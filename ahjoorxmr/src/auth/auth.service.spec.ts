import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { UsersService } from '../users/users.service';
import { TwoFactorService } from './two-factor.service';
import { StellarService } from '../stellar/stellar.service';

const hashToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

const makeRefreshRepo = () => ({
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn((d) => d),
  update: jest.fn(),
  delete: jest.fn(),
});

const makeUsersService = () => ({
  findByWalletAddress: jest.fn(),
  findById: jest.fn(),
  incrementTokenVersion: jest.fn().mockResolvedValue(1),
  revokeAllSessions: jest.fn(),
  updateRefreshToken: jest.fn(),
});

const makeJwtService = () => ({
  verifyAsync: jest.fn(),
  signAsync: jest.fn().mockResolvedValue('new-token'),
});

describe('AuthService – refresh token rotation (#155)', () => {
  let service: AuthService;
  let refreshRepo: ReturnType<typeof makeRefreshRepo>;
  let usersService: ReturnType<typeof makeUsersService>;
  let jwtService: ReturnType<typeof makeJwtService>;

  const VALID_TOKEN = 'valid-refresh-token';
  const VALID_HASH = hashToken(VALID_TOKEN);
  const USER_ID = 'user-uuid-1234';

  const mockUser = {
    id: USER_ID,
    walletAddress: 'GWALLET',
    email: 'test@example.com',
    role: 'user',
    tokenVersion: 0,
  };

  beforeEach(async () => {
    refreshRepo = makeRefreshRepo();
    usersService = makeUsersService();
    jwtService = makeJwtService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(RefreshToken), useValue: refreshRepo },
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('secret') } },
        { provide: TwoFactorService, useValue: {} },
        { provide: StellarService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('refreshTokens – valid rotation', () => {
    it('revokes old token and issues new tokens', async () => {
      const storedToken: Partial<RefreshToken> = {
        id: 'rt-1',
        userId: USER_ID,
        tokenHash: VALID_HASH,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      };

      jwtService.verifyAsync.mockResolvedValue({ sub: 'GWALLET' });
      refreshRepo.findOne.mockResolvedValue(storedToken);
      refreshRepo.save.mockResolvedValue({ ...storedToken, revokedAt: new Date() });
      usersService.findById.mockResolvedValue(mockUser);
      usersService.findByWalletAddress.mockResolvedValue(mockUser);

      const result = await service.refreshTokens(VALID_TOKEN);

      expect(refreshRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });
  });

  describe('refreshTokens – reuse of rotated token', () => {
    it('returns 401 when token is already revoked', async () => {
      const revokedToken: Partial<RefreshToken> = {
        id: 'rt-1',
        userId: USER_ID,
        tokenHash: VALID_HASH,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(Date.now() - 1000), // already revoked
      };

      jwtService.verifyAsync.mockResolvedValue({ sub: 'GWALLET' });
      refreshRepo.findOne.mockResolvedValue(revokedToken);

      await expect(service.refreshTokens(VALID_TOKEN)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns 401 when token hash is not found', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'GWALLET' });
      refreshRepo.findOne.mockResolvedValue(null);

      await expect(service.refreshTokens(VALID_TOKEN)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('logout flow', () => {
    it('revokes the specific token on logout', async () => {
      await service.logout(USER_ID, VALID_TOKEN);

      expect(refreshRepo.update).toHaveBeenCalledWith(
        { tokenHash: VALID_HASH },
        { revokedAt: expect.any(Date) },
      );
      expect(usersService.revokeAllSessions).toHaveBeenCalledWith(USER_ID);
    });

    it('revokes all tokens when no refresh token provided', async () => {
      await service.logout(USER_ID);

      expect(refreshRepo.update).toHaveBeenCalledWith(
        { userId: USER_ID, revokedAt: null },
        { revokedAt: expect.any(Date) },
      );
    });
  });
});
