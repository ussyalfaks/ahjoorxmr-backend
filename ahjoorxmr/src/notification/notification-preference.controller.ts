import {
  Controller,
  Get,
  Patch,
  Body,
  Request,
  UseGuards,
  Version,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { NotificationPreferenceService } from './notification-preference.service';
import {
  UpdateNotificationPreferencesDto,
  NotificationPreferencesResponseDto,
  NotificationPreferenceStatsDto,
} from './notification-preference.dto';
import { NotificationPreference } from './notification-preference.entity';

@ApiTags('Notification Preferences')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('users/me/notification-preferences')
@Version('1')
export class NotificationPreferenceController {
  constructor(private readonly prefService: NotificationPreferenceService) {}

  @Get()
  @ApiOperation({ summary: 'Get my notification preferences' })
  @ApiResponse({ status: 200, description: 'Full preferences map' })
  async get(
    @Request() req: { user: { id: string } },
  ): Promise<NotificationPreferencesResponseDto> {
    const pref = await this.prefService.getOrCreate(req.user.id);
    return {
      userId: req.user.id,
      preferences: pref.preferences,
      updatedAt: (pref as NotificationPreference).updatedAt,
    };
  }

  @Patch()
  @ApiOperation({ summary: 'Update my notification preferences (partial merge)' })
  @ApiResponse({ status: 200, description: 'Updated preferences map' })
  @ApiResponse({ status: 400, description: 'Unknown notification type keys' })
  async update(
    @Request() req: { user: { id: string } },
    @Body() dto: UpdateNotificationPreferencesDto,
  ): Promise<NotificationPreferencesResponseDto> {
    const pref = await this.prefService.update(req.user.id, dto);
    return {
      userId: req.user.id,
      preferences: pref.preferences,
      updatedAt: pref.updatedAt,
    };
  }
}

@ApiTags('Admin')
@ApiBearerAuth('JWT-auth')
@UseGuards(AdminGuard)
@Controller('admin/notification-preferences')
@Version('1')
export class AdminNotificationPreferenceController {
  constructor(private readonly prefService: NotificationPreferenceService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Opt-out rates per notification type and channel' })
  @ApiResponse({ status: 200, description: 'Preference stats for analytics' })
  async stats(): Promise<NotificationPreferenceStatsDto[]> {
    return this.prefService.getStats();
  }
}
