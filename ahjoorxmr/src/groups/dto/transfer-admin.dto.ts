import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TransferAdminDto {
  @ApiProperty({
    description: 'The user ID of the new admin',
    example: 'user-uuid-123',
  })
  @IsString()
  @IsNotEmpty()
  newAdminUserId: string;
}
