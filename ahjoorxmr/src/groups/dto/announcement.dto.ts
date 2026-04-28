import {
  IsString,
  IsOptional,
  IsBoolean,
  MaxLength,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAnnouncementDto {
  @ApiProperty({ description: 'Announcement title', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @ApiProperty({ description: 'Announcement body', maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body: string;

  @ApiPropertyOptional({ description: 'Pin announcement to top of list', default: false })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({
    description: 'If true, fan out a GROUP_ANNOUNCEMENT notification to all active members',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  notify?: boolean;
}

export class UpdateAnnouncementDto {
  @ApiPropertyOptional({ description: 'Updated title', maxLength: 255 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ description: 'Updated body', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body?: string;

  @ApiPropertyOptional({ description: 'Update pinned status' })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

export class AnnouncementQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
