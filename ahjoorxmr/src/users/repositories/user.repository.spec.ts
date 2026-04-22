import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRepository } from './user.repository';
import { User } from '../entities/user.entity';
import { MembershipStatus } from '../../memberships/entities/membership-status.enum';

describe('UserRepository', () => {
  let userRepository: UserRepository;
  let mockRepository: jest.Mocked<Repository<User>>;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    walletAddress: 'GABC123XYZ789',
    email: 'test@example.com',
    username: 'testuser',
    twoFactorSecret: null,
    twoFactorEnabled: false,
    firstName: 'Test',
    lastName: 'User',
    avatarUrl: null,
    bio: null,
    preferences: {},
    isActive: true,
    isVerified: false,
    isBanned: false,
    bannedAt: null,
    banReason: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    memberships: [],
    tokenVersion: 0,
    updateLastLogin: jest.fn(),
    ban: jest.fn(),
    unban: jest.fn(),
    verify: jest.fn(),
    fullName: 'Test User',
  } as any;

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRepository,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    userRepository = module.get<UserRepository>(UserRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByWalletAddress', () => {
    it('should find a user by wallet address', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await userRepository.findByWalletAddress('GABC123XYZ789');

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { walletAddress: 'GABC123XYZ789' },
        relations: ['memberships'],
      });
    });

    it('should return null if user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await userRepository.findByWalletAddress('NONEXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should find a user by email', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await userRepository.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        relations: ['memberships'],
      });
    });

    it('should return null if email not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await userRepository.findByEmail(
        'nonexistent@example.com',
      );

      expect(result).toBeNull();
    });
  });

  describe('searchUsers', () => {
    it('should search users by query', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockUser]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await userRepository.searchUsers('test', 10);

      expect(result).toEqual([mockUser]);
      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(mockQueryBuilder.where).toHaveBeenCalled();
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
    });

    it('should use default limit if not provided', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockUser]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      await userRepository.searchUsers('test');

      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login timestamp', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 } as any);

      await userRepository.updateLastLogin('user-id');

      expect(mockRepository.update).toHaveBeenCalledWith('user-id', {
        lastLoginAt: expect.any(Date),
      });
    });
  });

  describe('banUser', () => {
    it('should ban a user with reason', async () => {
      const user: any = {
        ...mockUser,
        tokenVersion: 0,
        ban(reason: string) {
          this.bannedAt = new Date();
          this.banReason = reason;
          this.isActive = false;
          this.isBanned = true;
        },
      };
      const bannedUser = { ...user, isBanned: true };
      mockRepository.findOne.mockResolvedValue(user);
      mockRepository.save.mockResolvedValue(bannedUser);

      const result = await userRepository.banUser('user-id', 'Terms violation');

      expect(result.isBanned).toBe(true);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isBanned: true,
          bannedAt: expect.any(Date),
          banReason: 'Terms violation',
          tokenVersion: 1,
        }),
      );
    });

    it('should ban a user without reason', async () => {
      const user: any = {
        ...mockUser,
        tokenVersion: 0,
        ban(reason: string) {
          this.bannedAt = new Date();
          this.banReason = reason;
          this.isActive = false;
          this.isBanned = true;
        },
      };
      const bannedUser = { ...user, isBanned: true };
      mockRepository.findOne.mockResolvedValue(user);
      mockRepository.save.mockResolvedValue(bannedUser);

      const result = await userRepository.banUser('user-id');

      expect(result.isBanned).toBe(true);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isBanned: true,
          bannedAt: expect.any(Date),
          tokenVersion: 1,
        }),
      );
    });

    it('should throw error if user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(userRepository.banUser('nonexistent-id')).rejects.toThrow(
        'User not found',
      );
    });
  });

  describe('verifyUser', () => {
    it('should verify a user', async () => {
      const user: any = {
        ...mockUser,
        tokenVersion: 0,
        verify() {
          this.isVerified = true;
        },
      };
      const verifiedUser = { ...user, isVerified: true };
      mockRepository.findOne.mockResolvedValue(user);
      mockRepository.save.mockResolvedValue(verifiedUser);

      const result = await userRepository.verifyUser('user-id');

      expect(result.isVerified).toBe(true);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isVerified: true,
        }),
      );
    });

    it('should throw error if user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(userRepository.verifyUser('nonexistent-id')).rejects.toThrow(
        'User not found',
      );
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated users', async () => {
      const users = [mockUser, { ...mockUser, id: 'user-2' }];
      mockRepository.findAndCount.mockResolvedValue([users, 2]);

      const result = await userRepository.findWithPagination(1, 10);

      expect(result.users).toEqual(users);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          order: { createdAt: 'DESC' },
        }),
      );
    });

    it('should handle pagination correctly for page 2', async () => {
      mockRepository.findAndCount.mockResolvedValue([[mockUser], 25]);

      await userRepository.findWithPagination(2, 10);

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });

  describe('softRemove', () => {
    it.skip('softRemove is inherited from TypeORM; requires full repository wiring in unit tests', () => {
      expect(true).toBe(true);
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics from memberships', async () => {
      const memberships = [
        {
          status: MembershipStatus.ACTIVE,
          contributionsMade: 4,
          group: {},
        },
        {
          status: MembershipStatus.ACTIVE,
          contributionsMade: 3,
          group: {},
        },
        {
          status: MembershipStatus.SUSPENDED,
          contributionsMade: 3,
          group: {},
        },
      ];
      mockRepository.findOne.mockResolvedValue({
        ...mockUser,
        memberships,
      } as any);

      const result = await userRepository.getUserStats('user-id');

      expect(result).toEqual({
        totalGroups: 3,
        activeGroups: 2,
        totalContributions: 10,
      });
    });

    it('should return zeros when user is missing', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await userRepository.getUserStats('user-id');

      expect(result).toEqual({
        totalGroups: 0,
        activeGroups: 0,
        totalContributions: 0,
      });
    });
  });
});
