/**
 * Response DTO for contribution data.
 * Returns all contribution fields with dates in ISO 8601 format.
 */
export class ContributionResponseDto {
  id: string;
  groupId: string;
  userId: string;
  walletAddress: string;
  roundNumber: number;
  amount: string;
  transactionHash: string;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
}
