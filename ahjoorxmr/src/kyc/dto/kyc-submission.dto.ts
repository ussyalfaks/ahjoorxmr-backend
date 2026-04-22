import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Sensitive } from '../../common/decorators/sensitive.decorator';

/**
 * Optional metadata that may accompany a KYC document upload.
 * All PII fields are annotated with @Sensitive() so the PiiScrubber
 * will redact them from logs and HMAC-hash them in audit records.
 */
export class KycSubmissionDto {
  @Sensitive()
  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @Sensitive()
  @ApiPropertyOptional({ example: 'A12345678' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nationalId?: string;

  @Sensitive()
  @ApiPropertyOptional({ example: '1990-01-15' })
  @IsOptional()
  @IsString()
  dob?: string;

  @Sensitive()
  @ApiPropertyOptional({ example: '123 Main St, City, Country' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @Sensitive()
  @ApiPropertyOptional({ example: '+1234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}
