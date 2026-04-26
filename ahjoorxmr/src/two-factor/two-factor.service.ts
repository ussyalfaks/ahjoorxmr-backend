import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '../users/entities/user.entity';
import { AuditLog } from '../kyc/entities/audit-log.entity';
import { NotificationsService } from '../notification/notifications.service';
import { NotificationType } from '../notification/enums/notification-type.enum';

const BCRYPT_ROUNDS = 10;
const BACKUP_CODE_COUNT = 10;

export interface BackupCodeUsageRecord {
  usedAt: Date;
  ipAddress: string;
  codeIndex: number;
}

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Generate BACKUP_CODE_COUNT plaintext backup codes, hash them, and persist.
   * Returns the plaintext codes — shown to the user once only.
   */
  async generateBackupCodes(userId: string): Promise<string[]> {
    const user = await this.findUserOrThrow(userId);

    const plaintextCodes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      crypto.randomBytes(5).toString('hex'), // 10-char hex code
    );

    const hashed = await Promise.all(
      plaintextCodes.map((c) => bcrypt.hash(c, BCRYPT_ROUNDS)),
    );

    user.twoFaBackupCodes = hashed;
    user.twoFaBackupCodesExhausted = false;
    await this.userRepo.save(user);

    this.logger.log(`Generated ${BACKUP_CODE_COUNT} backup codes for userId=${userId}`);
    return plaintextCodes;
  }

  /**
   * Verify a backup code, consume it, write an audit log entry, and send email.
   * Throws UnauthorizedException if no code matches.
   */
  async verifyBackupCode(
    userId: string,
    plaintextCode: string,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    const user = await this.findUserOrThrow(userId);

    const codes = user.twoFaBackupCodes ?? [];
    let matchedIndex = -1;

    for (let i = 0; i < codes.length; i++) {
      const match = await bcrypt.compare(plaintextCode, codes[i]);
      if (match) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex === -1) {
      throw new UnauthorizedException('Invalid backup code');
    }

    // Remove the consumed code (splice by index)
    const remaining = codes.filter((_, i) => i !== matchedIndex);
    user.twoFaBackupCodes = remaining;

    const allExhausted = remaining.length === 0;
    if (allExhausted) {
      user.twoFaBackupCodesExhausted = true;
    }

    await this.userRepo.save(user);

    // Audit log — never store the plaintext code
    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        userId,
        eventType: 'TWO_FA_BACKUP_CODE_USED',
        metadata: {
          codeIndex: matchedIndex,
          ipAddress,
          userAgent,
          remainingCodes: remaining.length,
        },
      }),
    );

    this.logger.log(
      `Backup code used userId=${userId} index=${matchedIndex} ip=${ipAddress} remaining=${remaining.length}`,
    );

    // Email: backup code used
    await this.sendBackupCodeUsedEmail(user, ipAddress, matchedIndex);

    // Email: all codes exhausted
    if (allExhausted) {
      await this.sendCodesExhaustedEmail(user);
    }
  }

  /**
   * Return the consumption history for a user from AuditLog.
   */
  async getBackupCodeUsage(userId: string): Promise<BackupCodeUsageRecord[]> {
    const logs = await this.auditLogRepo.find({
      where: { userId, eventType: 'TWO_FA_BACKUP_CODE_USED' },
      order: { createdAt: 'DESC' },
    });

    return logs.map((log) => ({
      usedAt: log.createdAt,
      ipAddress: String((log.metadata as Record<string, unknown>)?.['ipAddress'] ?? ''),
      codeIndex: Number((log.metadata as Record<string, unknown>)?.['codeIndex'] ?? -1),
    }));
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async findUserOrThrow(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return user;
  }

  private async sendBackupCodeUsedEmail(
    user: User,
    ipAddress: string,
    codeIndex: number,
  ): Promise<void> {
    if (!user.email) return;

    await this.notificationsService.notify({
      userId: user.id,
      type: NotificationType.TWO_FA_BACKUP_CODE_USED,
      title: 'A 2FA backup code was used to sign in',
      body: `A backup recovery code (index ${codeIndex}) was used to access your account from IP ${ipAddress} at ${new Date().toISOString()}. If this wasn't you, secure your account immediately.`,
      sendEmail: true,
      emailTo: user.email,
      emailTemplateData: { ipAddress, codeIndex, usedAt: new Date().toISOString() },
    });
  }

  private async sendCodesExhaustedEmail(user: User): Promise<void> {
    if (!user.email) return;

    await this.notificationsService.notify({
      userId: user.id,
      type: NotificationType.TWO_FA_BACKUP_CODES_EXHAUSTED,
      title: 'All your 2FA backup codes have been used',
      body: 'You have used all your backup recovery codes. Please log in and generate a new set of backup codes to maintain account recovery access.',
      sendEmail: true,
      emailTo: user.email,
    });
  }
}
