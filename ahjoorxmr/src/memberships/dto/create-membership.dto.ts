import { IsUUID, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateMembershipDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  walletAddress: string;
}
