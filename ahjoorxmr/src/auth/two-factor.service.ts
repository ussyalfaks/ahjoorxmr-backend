import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { Enable2FAResponseDto } from './dto/two-factor.dto';

/** Payload shape for the short-lived pre-auth JWT issued during 2FA login. */
export interface PreAuthPayload {
  sub: string;
  email: string;
  role: string;
  twoFactorPending: true;
}

@Injectable()
export class TwoFactorService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ── Primitive helpers ──────────────────────────────────────────────────────

  generateSecret(): string {
    return authenticator.generateSecret();
  }

  async generateQRCode(email: string, secret: string): Promise<string> {
    const otpauth = authenticator.keyuri(email, 'Ahjoorxmr', secret);
    return QRCode.toDataURL(otpauth);
  }

  verifyToken(token: string, secret: string): boolean {
    try {
      return authenticator.verify({ token, secret });
    } catch {
      return false;
    }
  }

  generateBackupCodes(count = 8): string[] {
    return Array.from({ length: count }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase(),
    );
  }

  hashBackupCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  verifyBackupCode(code: string, hashedCodes: string[]): boolean {
    return hashedCodes.includes(this.hashBackupCode(code));
  }

  // ── Pre-auth token (issued when 2FA is required at login) ─────────────────

  issuePreAuthToken(userId: string, email: string, role: string): string {
    const payload: PreAuthPayload = {
      sub: userId,
      email,
      role,
      twoFactorPending: true,
    };
    return this.jwtService.sign(payload, {
      secret:
        this.configService.get<string>('JWT_ACCESS_SECRET') ||
        'default_access_secret',
      expiresIn: '5m',
    });
  }

  verifyPreAuthToken(token: string): PreAuthPayload {
    try {
      const payload = this.jwtService.verify<PreAuthPayload>(token, {
        secret:
          this.configService.get<string>('JWT_ACCESS_SECRET') ||
          'default_access_secret',
      });
      if (!payload.twoFactorPending) {
        throw new UnauthorizedException('Invalid pre-auth token');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired pre-auth token');
    }
  }

  // ── 2FA flow methods ───────────────────────────────────────────────────────

  /**
   * Step 1 of setup: generate secret + QR code + backup codes and persist the
   * secret (and hashed backup codes) to the user record.
   * twoFactorEnabled remains false until verify() is called.
   */
  async enable(userId: string): Promise<Enable2FAResponseDto> {
    const user = await this.usersService.findById2FA(userId);

    const secret = this.generateSecret();
    const qrCode = await this.generateQRCode(user.email ?? userId, secret);
    const backupCodes = this.generateBackupCodes();
    const hashedBackupCodes = backupCodes.map((c) => this.hashBackupCode(c));

    await this.usersService.update2FA(userId, {
      twoFactorSecret: secret,
      twoFactorEnabled: false, // not active until verified
      backupCodes: hashedBackupCodes,
    });

    return { qrCode, secret, backupCodes };
  }

  /**
   * Step 2 of setup: confirm the user's authenticator app is working by
   * verifying a live TOTP token, then flip twoFactorEnabled = true.
   */
  async verify(userId: string, token: string): Promise<void> {
    const user = await this.usersService.findById2FA(userId);

    if (!user.twoFactorSecret) {
      throw new BadRequestException('2FA setup has not been initiated');
    }

    if (!this.verifyToken(token, user.twoFactorSecret)) {
      throw new BadRequestException('Invalid TOTP token');
    }

    await this.usersService.update2FA(userId, { twoFactorEnabled: true });
  }

  /**
   * Disable 2FA: requires the current password AND a valid TOTP token, then
   * clears all 2FA fields from the user record.
   */
  async disable(
    userId: string,
    password: string,
    token: string,
  ): Promise<void> {
    const user = await this.usersService.findById2FA(userId);

    if (!user.twoFactorEnabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    if (!user.password) {
      throw new BadRequestException('Password verification not available');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    if (!this.verifyToken(token, user.twoFactorSecret!)) {
      throw new UnauthorizedException('Invalid TOTP token');
    }

    await this.usersService.update2FA(userId, {
      twoFactorSecret: null,
      twoFactorEnabled: false,
      backupCodes: null,
    });
  }

  /**
   * Complete a 2FA-gated login.
   * Accepts either a live TOTP token or a backup code.
   * On backup code use, the consumed code is removed from the stored list.
   *
   * @returns the userId so AuthService can issue full tokens
   */
  async completeTwoFactorLogin(
    preAuthToken: string,
    token: string,
  ): Promise<string> {
    const payload = this.verifyPreAuthToken(preAuthToken);
    const user = await this.usersService.findById2FA(payload.sub);

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new ForbiddenException('2FA is not enabled for this account');
    }

    // Try TOTP first
    if (this.verifyToken(token, user.twoFactorSecret)) {
      return user.id;
    }

    // Try backup code
    const hashedCodes = user.backupCodes ?? [];
    const hashedInput = this.hashBackupCode(token);
    const codeIndex = hashedCodes.indexOf(hashedInput);

    if (codeIndex === -1) {
      throw new UnauthorizedException('Invalid TOTP token or backup code');
    }

    // Consume the backup code — remove it so it cannot be reused
    const updatedCodes = hashedCodes.filter((_, i) => i !== codeIndex);
    await this.usersService.update2FA(user.id, { backupCodes: updatedCodes });

    return user.id;
  }
}
