import { Entity, Column, OneToMany, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Membership } from '../../memberships/entities/membership.entity';

/**
 * User entity representing a user in the system.
 * Contains authentication, profile, and relationship data.
 */
@Entity('users')
@Index(['email'], { unique: true, where: 'email IS NOT NULL' })
@Index(['walletAddress'], { unique: true })
@Index(['createdAt'])
export class User extends BaseEntity {
  // Authentication
  @Column({ type: 'varchar', length: 255, unique: true })
  walletAddress: string;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  email?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  username?: string;

  // Two-Factor Authentication
  @Column({ type: 'varchar', length: 255, nullable: true })
  twoFactorSecret?: string;

  @Column({ type: 'boolean', default: false })
  twoFactorEnabled: boolean;

  @Column({ type: 'simple-array', nullable: true })
  backupCodes?: string[];

  // Profile Information
  @Column({ type: 'varchar', length: 255, nullable: true })
  firstName?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastName?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl?: string;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  // Settings & Preferences
  @Column({ type: 'jsonb', nullable: true })
  preferences?: {
    language?: string;
    currency?: string;
    notifications?: {
      email?: boolean;
      push?: boolean;
      sms?: boolean;
    };
    theme?: 'light' | 'dark' | 'auto';
  };

  // Account Status
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  bannedAt?: Date;

  @Column({ type: 'text', nullable: true })
  banReason?: string;

  // Metadata
  @Column({ type: 'varchar', length: 100, nullable: true })
  registrationIp?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastLoginIp?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  // Relationships
  @OneToMany(() => Membership, (membership) => membership.user, {
    cascade: true,
  })
  memberships?: Membership[];

  // Virtual fields (not stored in database)
  get fullName(): string {
    if (this.firstName && this.lastName) {
      return `${this.firstName} ${this.lastName}`;
    }
    return this.firstName || this.lastName || this.username || 'Anonymous';
  }

  get isBanned(): boolean {
    return this.bannedAt !== null && this.bannedAt !== undefined;
  }

  // Helper methods
  updateLastLogin(ipAddress?: string): void {
    this.lastLoginAt = new Date();
    if (ipAddress) {
      this.lastLoginIp = ipAddress;
    }
  }

  ban(reason: string): void {
    this.bannedAt = new Date();
    this.banReason = reason;
    this.isActive = false;
  }

  unban(): void {
    this.bannedAt = null;
    this.banReason = null;
    this.isActive = true;
  }

  verify(): void {
    this.isVerified = true;
    this.verifiedAt = new Date();
  }
}
