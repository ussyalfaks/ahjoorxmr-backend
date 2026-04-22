import { Expose } from 'class-transformer';
import { KycStatus } from '../entities/user.entity'; // Import from entity if defined there, or from its dedicated file

export enum KycStatusEnum {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

export class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  email: string | null;

  @Expose()
  displayName: string;

  @Expose()
  createdAt: Date;

  @Expose()
  kycStatus: string | null;

  @Expose()
  walletAddress: string;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
