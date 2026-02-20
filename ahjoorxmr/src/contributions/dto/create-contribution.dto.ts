import { IsUUID, IsNotEmpty, IsString, MinLength, IsInt, Min, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateContributionDto {
  @IsUUID()
  @IsNotEmpty()
  groupId: string;

  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  walletAddress: string;

  @IsInt()
  @Min(1)
  roundNumber: number;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  amount: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  transactionHash: string;

  @IsDate()
  @Type(() => Date)
  timestamp: Date;
}
