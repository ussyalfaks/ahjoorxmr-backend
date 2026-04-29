import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsString, IsOptional, IsNumber, IsArray, Min, Max } from 'class-validator';
import { MaintenanceModeConfig } from '../services/maintenance-mode.service';

export class SetMaintenanceModeDto implements Partial<MaintenanceModeConfig> {
  @ApiProperty({ description: 'Enable or disable maintenance mode' })
  @IsBoolean()
  enabled: boolean;

  @ApiPropertyOptional({ description: 'Message to display during maintenance' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ description: 'Seconds until retry is allowed', default: 300 })
  @IsOptional()
  @IsNumber()
  @Min(60)
  @Max(86400)
  retryAfterSeconds?: number;

  @ApiPropertyOptional({ description: 'List of IPs allowed during maintenance' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedIps?: string[];
}

export class MaintenanceStatusResponseDto {
  @ApiProperty({ description: 'Global maintenance status', nullable: true })
  global: MaintenanceModeConfig | null;

  @ApiProperty({ description: 'Per-group maintenance status' })
  groups: Record<string, MaintenanceModeConfig>;
}

export class MaintenanceModeResponseDto {
  @ApiProperty({ description: 'Whether maintenance mode is enabled' })
  enabled: boolean;

  @ApiProperty({ description: 'Maintenance message' })
  message: string;

  @ApiProperty({ description: 'Seconds until retry is allowed' })
  retryAfter: number;

  @ApiProperty({ description: 'Allowed IPs during maintenance' })
  allowedIps: string[];
}