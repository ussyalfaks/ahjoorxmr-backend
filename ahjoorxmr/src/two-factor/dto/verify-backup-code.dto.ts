import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyBackupCodeDto {
  @ApiProperty({ description: 'Plaintext backup recovery code', example: 'a1b2c3d4e5' })
  @IsString()
  @Length(1, 64)
  code: string;
}
