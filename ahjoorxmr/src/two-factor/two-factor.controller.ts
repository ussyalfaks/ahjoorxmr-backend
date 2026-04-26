import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { TwoFactorService } from './two-factor.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VerifyBackupCodeDto } from './dto/verify-backup-code.dto';

@ApiTags('2FA')
@Controller('auth/2fa')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class TwoFactorController {
  constructor(private readonly twoFactorService: TwoFactorService) {}

  @Post('backup-codes/generate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a fresh set of backup recovery codes' })
  @ApiResponse({ status: 201, description: 'Plaintext codes returned once' })
  async generateBackupCodes(
    @CurrentUser('id') userId: string,
  ): Promise<{ codes: string[] }> {
    const codes = await this.twoFactorService.generateBackupCodes(userId);
    return { codes };
  }

  @Post('backup-codes/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify and consume a backup recovery code' })
  @ApiResponse({ status: 200, description: 'Code accepted' })
  @ApiResponse({ status: 401, description: 'Invalid backup code' })
  async verifyBackupCode(
    @CurrentUser('id') userId: string,
    @Body() dto: VerifyBackupCodeDto,
    @Req() req: Request,
  ): Promise<{ success: true }> {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'unknown';
    const userAgent = req.headers['user-agent'] ?? 'unknown';

    await this.twoFactorService.verifyBackupCode(
      userId,
      dto.code,
      ipAddress,
      userAgent,
    );
    return { success: true };
  }

  @Get('backup-codes/usage')
  @ApiOperation({
    summary: 'Get backup code consumption history',
    description: 'Returns an array of { usedAt, ipAddress, codeIndex } from AuditLog.',
  })
  @ApiResponse({ status: 200, description: 'Usage history' })
  async getBackupCodeUsage(@CurrentUser('id') userId: string) {
    return this.twoFactorService.getBackupCodeUsage(userId);
  }
}
