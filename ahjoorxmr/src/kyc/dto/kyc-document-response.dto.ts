import { ApiProperty } from '@nestjs/swagger';
import { KycStatus } from '../entities/kyc-status.enum';

export class KycDocumentResponseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'kyc/user-id/document.pdf' })
  storageKey: string;

  @ApiProperty({ example: 'https://bucket.s3.amazonaws.com/kyc/user-id/document.pdf' })
  url: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType: string;

  @ApiProperty({ example: 204800 })
  fileSize: number;

  @ApiProperty({ example: 'passport.pdf' })
  originalName: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  uploadedAt: string;

  @ApiProperty({ enum: KycStatus, example: KycStatus.PENDING })
  kycStatus: KycStatus;
}
