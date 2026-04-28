import { IsString, IsArray, IsOptional, IsDateString, ArrayUnique, IsEnum, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KeyScope } from '../key-scope.enum';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Treasury Integration Key' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ 
    example: [KeyScope.READ_GROUPS, KeyScope.READ_CONTRIBUTIONS],
    enum: KeyScope,
    isArray: true 
  })
  @IsArray()
  @IsEnum(KeyScope, { each: true })
  @ArrayUnique()
  @IsOptional()
  scopes?: KeyScope[];

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

export class ApiKeyResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  ownerId: string;

  @ApiProperty()
  scopes: string[];

  @ApiPropertyOptional()
  lastUsedAt: Date | null;

  @ApiPropertyOptional()
  expiresAt: Date | null;

  @ApiPropertyOptional()
  revokedAt: Date | null;

  @ApiProperty()
  createdAt: Date;
}

export class CreateApiKeyResponseDto extends ApiKeyResponseDto {
  @ApiProperty({ description: 'Plaintext key — shown only once', example: 'ak_live_abc123...' })
  key: string;
}
