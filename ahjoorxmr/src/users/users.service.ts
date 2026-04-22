import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from './repositories/user.repository';
import { User } from './entities/user.entity';
import { TokenVersionCacheService } from '../common/redis/token-version-cache.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly tokenVersionCache: TokenVersionCacheService,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  async findByWalletAddress(walletAddress: string): Promise<User | null> {
    return this.userRepository.findByWalletAddress(walletAddress);
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  async updateRefreshToken(
    userId: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.userRepository.update(userId, { refreshTokenHash });
  }

  async updateRefreshTokenHash(
    userId: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.updateRefreshToken(userId, refreshTokenHash);
  }

  async incrementTokenVersion(userId: string): Promise<number> {
    const user = await this.findById(userId);
    const newVersion = (user.tokenVersion || 0) + 1;
    await this.userRepository.update(userId, { tokenVersion: newVersion });
    await this.tokenVersionCache.invalidate(userId);
    return newVersion;
  }

  async revokeAllSessions(userId: string): Promise<void> {
    const user = await this.findById(userId);
    await this.userRepository.update(userId, {
      refreshTokenHash: null,
      tokenVersion: (user.tokenVersion ?? 0) + 1,
    });
    await this.tokenVersionCache.invalidate(userId);
  }

  /**
   * Revokes JWT sessions after a password change. Call from password-reset flows when implemented.
   */
  async revokeSessionsAfterPasswordChange(userId: string): Promise<void> {
    await this.incrementTokenVersion(userId);
  }

  async banUser(userId: string, reason?: string): Promise<User> {
    const user = await this.userRepository.banUser(userId, reason);
    await this.tokenVersionCache.invalidate(userId);
    return user;
  }

  async upsertByWalletAddress(walletAddress: string): Promise<User> {
    let user = await this.findByWalletAddress(walletAddress);
    if (!user) {
      user = await this.create({ walletAddress });
    }
    return user;
  }

  async update2FA(
    userId: string,
    fields: {
      twoFactorSecret?: string | null;
      twoFactorEnabled?: boolean;
      backupCodes?: string[] | null;
    },
  ): Promise<void> {
    await this.userRepository.update(userId, fields);
  }

  async findById2FA(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
