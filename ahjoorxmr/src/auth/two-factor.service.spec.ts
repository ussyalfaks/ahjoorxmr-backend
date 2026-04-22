import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TwoFactorService } from './two-factor.service';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

// ── Shared fixture ────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-uuid',
    email: 'test@example.com',
    password: 'stored-hash',
    role: 'user',
    twoFactorEnabled: false,
    twoFactorSecret: null,
    backupCodes: null,
    tokenVersion: 0,
    ...overrides,
  } as User;
}

// ── TwoFactorService ──────────────────────────────────────────────────────────

describe('TwoFactorService', () => {
  let service: TwoFactorService;
  let usersService: jest.Mocked<
    Pick<UsersService, 'findById2FA' | 'update2FA'>
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign' | 'verify'>>;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;

  beforeEach(async () => {
    usersService = {
      findById2FA: jest.fn(),
      update2FA: jest.fn().mockResolvedValue(undefined),
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('pre-auth-token'),
      verify: jest.fn(),
    };
    configService = { get: jest.fn().mockReturnValue('test-secret') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get(TwoFactorService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── enable() ─────────────────────────────────────────────────────────────

  describe('enable()', () => {
    it('persists secret and hashed backup codes; returns plaintext codes and QR', async () => {
      usersService.findById2FA.mockResolvedValue(makeUser());

      const result = await service.enable('user-uuid');

      expect(result.secret).toBeTruthy();
      expect(result.qrCode).toMatch(/^data:image\/png;base64,/);
      expect(result.backupCodes).toHaveLength(8);

      expect(usersService.update2FA).toHaveBeenCalledWith(
        'user-uuid',
        expect.objectContaining({
          twoFactorSecret: result.secret,
          twoFactorEnabled: false,
          backupCodes: expect.arrayContaining([expect.any(String)]),
        }),
      );

      // Stored codes must be hashed — not equal to plaintext
      const stored = (usersService.update2FA as jest.Mock).mock.calls[0][1]
        .backupCodes as string[];
      expect(stored[0]).not.toBe(result.backupCodes[0]);
    });

    it('QR code encodes the same secret that is persisted', async () => {
      usersService.findById2FA.mockResolvedValue(makeUser());

      const result = await service.enable('user-uuid');
      const storedSecret = (usersService.update2FA as jest.Mock).mock
        .calls[0][1].twoFactorSecret as string;

      expect(storedSecret).toBe(result.secret);
    });
  });

  // ── verify() ─────────────────────────────────────────────────────────────

  describe('verify()', () => {
    it('throws BadRequestException when no secret is stored', async () => {
      usersService.findById2FA.mockResolvedValue(
        makeUser({ twoFactorSecret: null }),
      );

      await expect(service.verify('user-uuid', '123456')).rejects.toThrow(
        BadRequestException,
      );
      expect(usersService.update2FA).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when TOTP token is invalid', async () => {
      usersService.findById2FA.mockResolvedValue(
        makeUser({ twoFactorSecret: 'JBSWY3DPEHPK3PXP' }),
      );
      jest.spyOn(service, 'verifyToken').mockReturnValue(false);

      await expect(service.verify('user-uuid', '000000')).rejects.toThrow(
        BadRequestException,
      );
      expect(usersService.update2FA).not.toHaveBeenCalled();
    });

    it('sets twoFactorEnabled = true when token is valid', async () => {
      usersService.findById2FA.mockResolvedValue(
        makeUser({ twoFactorSecret: 'JBSWY3DPEHPK3PXP' }),
      );
      jest.spyOn(service, 'verifyToken').mockReturnValue(true);

      await service.verify('user-uuid', '123456');

      expect(usersService.update2FA).toHaveBeenCalledWith('user-uuid', {
        twoFactorEnabled: true,
      });
    });
  });

  // ── disable() ────────────────────────────────────────────────────────────

  describe('disable()', () => {
    it('throws BadRequestException when 2FA is not enabled', async () => {
      usersService.findById2FA.mockResolvedValue(
        makeUser({ twoFactorEnabled: false }),
      );

      await expect(
        service.disable('user-uuid', 'correct-password', '123456'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws UnauthorizedException on wrong password', async () => {
      usersService.findById2FA.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: 'SECRET' }),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.disable('user-uuid', 'wrong-password', '123456'),
      ).rejects.toThrow(UnauthorizedException);
      expect(usersService.update2FA).not.toHaveBeenCalled();
    });

    it('throws UnauthorizedException on invalid TOTP token', async () => {
      usersService.findById2FA.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: 'SECRET' }),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jest.spyOn(service, 'verifyToken').mockReturnValue(false);

      await expect(
        service.disable('user-uuid', 'correct-password', '000000'),
      ).rejects.toThrow(UnauthorizedException);
      expect(usersService.update2FA).not.toHaveBeenCalled();
    });

    it('clears all 2FA fields when password and token are valid', async () => {
      usersService.findById2FA.mockResolvedValue(
        makeUser({
          twoFactorEnabled: true,
          twoFactorSecret: 'SECRET',
          backupCodes: ['hashed1', 'hashed2'],
        }),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jest.spyOn(service, 'verifyToken').mockReturnValue(true);

      await service.disable('user-uuid', 'correct-password', '123456');

      expect(usersService.update2FA).toHaveBeenCalledWith('user-uuid', {
        twoFactorSecret: null,
        twoFactorEnabled: false,
        backupCodes: null,
      });
    });
  });

  // ── completeTwoFactorLogin() ──────────────────────────────────────────────

  describe('completeTwoFactorLogin()', () => {
    const validPayload = {
      sub: 'user-uuid',
      email: 'test@example.com',
      role: 'user',
      twoFactorPending: true as const,
    };

    beforeEach(() => {
      jwtService.verify.mockReturnValue(validPayload);
    });

    it('throws UnauthorizedException on invalid pre-auth token', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(
        service.completeTwoFactorLogin('bad-token', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException when 2FA is not enabled on the account', async () => {
      usersService.findById2FA.mockResolvedValue(
        makeUser({ twoFactorEnabled: false }),
      );

      await expect(
        service.completeTwoFactorLogin('pre-auth-token', '123456'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns userId when TOTP token is valid', async () => {
      usersService.findById2FA.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: 'SECRET' }),
      );
      jest.spyOn(service, 'verifyToken').mockReturnValue(true);

      const userId = await service.completeTwoFactorLogin(
        'pre-auth-token',
        '123456',
      );

      expect(userId).toBe('user-uuid');
      expect(usersService.update2FA).not.toHaveBeenCalled();
    });

    it('accepts a valid backup code and removes it from the stored list', async () => {
      const plainCode = 'ABCD1234';
      const hashedCode = service.hashBackupCode(plainCode);

      usersService.findById2FA.mockResolvedValue(
        makeUser({
          twoFactorEnabled: true,
          twoFactorSecret: 'SECRET',
          backupCodes: [hashedCode, 'other-hashed-code'],
        }),
      );
      jest.spyOn(service, 'verifyToken').mockReturnValue(false);

      const userId = await service.completeTwoFactorLogin(
        'pre-auth-token',
        plainCode,
      );

      expect(userId).toBe('user-uuid');
      expect(usersService.update2FA).toHaveBeenCalledWith('user-uuid', {
        backupCodes: ['other-hashed-code'],
      });
    });

    it('rejects a backup code that has already been consumed', async () => {
      const plainCode = 'ABCD1234';
      usersService.findById2FA.mockResolvedValue(
        makeUser({
          twoFactorEnabled: true,
          twoFactorSecret: 'SECRET',
          backupCodes: ['other-hashed-code'],
        }),
      );
      jest.spyOn(service, 'verifyToken').mockReturnValue(false);

      await expect(
        service.completeTwoFactorLogin('pre-auth-token', plainCode),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when both TOTP and backup code are invalid', async () => {
      usersService.findById2FA.mockResolvedValue(
        makeUser({
          twoFactorEnabled: true,
          twoFactorSecret: 'SECRET',
          backupCodes: [],
        }),
      );
      jest.spyOn(service, 'verifyToken').mockReturnValue(false);

      await expect(
        service.completeTwoFactorLogin('pre-auth-token', 'BADCODE'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── pre-auth token helpers ────────────────────────────────────────────────

  describe('verifyPreAuthToken()', () => {
    it('throws when twoFactorPending flag is absent', () => {
      jwtService.verify.mockReturnValue({
        sub: 'u1',
        email: 'e',
        role: 'user',
      });

      expect(() => service.verifyPreAuthToken('some-token')).toThrow(
        UnauthorizedException,
      );
    });

    it('throws on expired token', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      expect(() => service.verifyPreAuthToken('expired-token')).toThrow(
        UnauthorizedException,
      );
    });
  });
});

// ── AuthService.login — 2FA gate ──────────────────────────────────────────────

describe('AuthService.login — 2FA gate', () => {
  let authService: AuthService;
  let usersService: jest.Mocked<
    Pick<UsersService, 'findByEmail' | 'findById' | 'updateRefreshToken'>
  >;
  let twoFactorService: jest.Mocked<
    Pick<TwoFactorService, 'issuePreAuthToken'>
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync'>>;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;

  beforeEach(async () => {
    usersService = {
      findByEmail: jest.fn(),
      findById: jest.fn(),
      updateRefreshToken: jest.fn().mockResolvedValue(undefined),
    };
    twoFactorService = {
      issuePreAuthToken: jest.fn().mockReturnValue('pre-auth-jwt'),
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('access-token') };
    configService = { get: jest.fn().mockReturnValue('secret') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: TwoFactorService, useValue: twoFactorService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  it('returns tokens directly when 2FA is not enabled', async () => {
    usersService.findByEmail.mockResolvedValue(
      makeUser({ twoFactorEnabled: false }),
    );
    usersService.findById.mockResolvedValue(makeUser({ tokenVersion: 0 }));
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await authService.login({
      email: 'test@example.com',
      password: 'password',
    });

    expect(result).toHaveProperty('accessToken');
    expect(twoFactorService.issuePreAuthToken).not.toHaveBeenCalled();
  });

  it('throws ForbiddenException with preAuthToken when 2FA is enabled', async () => {
    usersService.findByEmail.mockResolvedValue(
      makeUser({ twoFactorEnabled: true }),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await expect(
      authService.login({ email: 'test@example.com', password: 'password' }),
    ).rejects.toThrow(ForbiddenException);

    expect(twoFactorService.issuePreAuthToken).toHaveBeenCalledWith(
      'user-uuid',
      'test@example.com',
      'user',
    );
  });

  it('throws UnauthorizedException on wrong password regardless of 2FA state', async () => {
    usersService.findByEmail.mockResolvedValue(
      makeUser({ twoFactorEnabled: true }),
    );
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      authService.login({ email: 'test@example.com', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);

    expect(twoFactorService.issuePreAuthToken).not.toHaveBeenCalled();
  });
});
