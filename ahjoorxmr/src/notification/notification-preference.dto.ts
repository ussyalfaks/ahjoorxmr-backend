import { IsEnum, IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { NotificationType } from './notification-type.enum';
import { ChannelPreference, PreferencesMap } from './notification-preference.entity';

export class ChannelPreferenceDto {
  @IsOptional()
  @IsBoolean()
  inApp?: boolean;

  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  push?: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ApiProperty({
    description: 'Partial map of NotificationType → channel flags',
    example: { payout_received: { email: false } },
  })
  preferences: Partial<Record<string, ChannelPreferenceDto>>;
}

export class NotificationPreferencesResponseDto {
  userId: string;
  preferences: PreferencesMap;
  updatedAt: Date;
}

export class NotificationPreferenceStatsDto {
  type: NotificationType;
  channel: keyof ChannelPreference;
  totalUsers: number;
  optedOut: number;
  optOutRate: number;
}
