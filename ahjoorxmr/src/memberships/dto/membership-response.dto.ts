import { MembershipStatus } from '../entities/membership-status.enum';

/**
 * Response DTO for membership data.
 * Returns all membership fields with dates in ISO 8601 format.
 */
export class MembershipResponseDto {
  id: string;
  groupId: string;
  userId: string;
  walletAddress: string;
  payoutOrder: number;
  hasReceivedPayout: boolean;
  hasPaidCurrentRound: boolean;
  transactionHash?: string | null;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
}
