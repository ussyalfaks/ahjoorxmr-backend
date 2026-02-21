import { GroupStatus } from '../entities/group-status.enum';
import { MembershipResponseDto } from '../../memberships/dto/membership-response.dto';

/**
 * Response DTO for a single group.
 * Dates are returned as ISO 8601 strings for consistency.
 * Members are only included for the GET /:id endpoint.
 */
export class GroupResponseDto {
    id: string;
    name: string;
    contractAddress: string | null;
    adminWallet: string;
    contributionAmount: string;
    token: string;
    roundDuration: number;
    status: GroupStatus;
    currentRound: number;
    totalRounds: number;
    createdAt: string;
    updatedAt: string;
    members?: MembershipResponseDto[];
}

/**
 * Response DTO for a paginated list of groups.
 */
export class PaginatedGroupsResponseDto {
    data: GroupResponseDto[];
    total: number;
    page: number;
    limit: number;
}
