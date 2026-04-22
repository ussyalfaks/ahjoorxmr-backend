import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';
import { TokenVersionCacheService } from '../common/redis/token-version-cache.service';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersService: UsersService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_PUBLIC_KEY') return 'test-public-key';
      return null;
    }),
  };

  const mockUsersService = {
    findById: jest.fn(),
  };

  const mockTokenVersionCache = {
    get: jest.fn(),
    set: jest.fn(),
    invalidate: jest.fn(),
  };

  beforeEach(async () => {
    mockTokenVersionCache.get.mockResolvedValue(null);
    mockTokenVersionCache.set.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: TokenVersionCacheService,
          useValue: mockTokenVersionCache,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    usersService = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should return user data when user exists', async () => {
      const mockUser = {
        id: 'user-id',
        walletAddress: 'GTEST...',
        role: UserRole.ADMIN,
        tokenVersion: 0,
      };

      mockUsersService.findById.mockResolvedValue(mockUser);

      const payload = {
        sub: 'user-id',
        walletAddress: 'GTEST...',
        tokenVersion: 0,
      };
      const result = await strategy.validate(payload);

      expect(result).toEqual({
        id: mockUser.id,
        walletAddress: mockUser.walletAddress,
        role: mockUser.role,
      });
      expect(usersService.findById).toHaveBeenCalledWith('user-id');
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockUsersService.findById.mockResolvedValue(null);

      const payload = {
        sub: 'non-existent-id',
        walletAddress: 'GTEST...',
        tokenVersion: 0,
      };

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(payload)).rejects.toThrow(
        'User not found',
      );
    });

    it('should include role in returned user object', async () => {
      const mockUser = {
        id: 'user-id',
        walletAddress: 'GTEST...',
        role: UserRole.MODERATOR,
        tokenVersion: 0,
      };

      mockUsersService.findById.mockResolvedValue(mockUser);

      const payload = {
        sub: 'user-id',
        walletAddress: 'GTEST...',
        tokenVersion: 0,
      };
      const result = await strategy.validate(payload);

      expect(result.role).toBe(UserRole.MODERATOR);
    });
  });
});
