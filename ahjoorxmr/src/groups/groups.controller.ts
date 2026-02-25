import {
    Controller,
    Post,
    Get,
    Patch,
    Body,
    Param,
    Query,
    HttpCode,
    HttpStatus,
    ParseUUIDPipe,
    UseGuards,
    Request,
    ParseIntPipe,
    DefaultValuePipe,
    Version,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import {
    GroupResponseDto,
    PaginatedGroupsResponseDto,
} from './dto/group-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Group } from './entities/group.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { MembershipResponseDto } from '../memberships/dto/membership-response.dto';
import { AuditLog } from '../audit/decorators/audit-log.decorator';

/**
 * Controller for managing ROSCA groups.
 * Provides REST API endpoints for creating, listing, fetching, and updating groups.
 *
 * IMPORTANT: The GET /my route is declared BEFORE GET /:id to prevent
 * NestJS from treating "my" as a UUID parameter.
 */
@Controller('groups')
@Version('1')
export class GroupsController {
    constructor(private readonly groupsService: GroupsService) { }

    /**
     * Creates a new ROSCA group with status PENDING.
     * The adminWallet is taken from the authenticated user's token payload.
     *
     * @param req - Authenticated request object (contains req.user from JwtAuthGuard)
     * @param createGroupDto - Group creation payload
     * @returns The created group as GroupResponseDto with HTTP 201
     */
    @Post()
    @UseGuards(JwtAuthGuard)
    @HttpCode(HttpStatus.CREATED)
    @AuditLog({ action: 'CREATE', resource: 'GROUP' })
    async createGroup(
        @Request() req: { user: { id: string; walletAddress: string } },
        @Body() createGroupDto: CreateGroupDto,
    ): Promise<GroupResponseDto> {
        const adminWallet = req.user.walletAddress || req.user.id;
        const group = await this.groupsService.createGroup(
            createGroupDto,
            adminWallet,
        );
        return this.toGroupResponse(group);
    }

    /**
     * Returns a paginated list of all ROSCA groups.
     *
     * @param page - Page number (default: 1)
     * @param limit - Items per page (default: 10)
     * @returns Paginated list of groups
     */
    @Get()
    async findAll(
        @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
        @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    ): Promise<PaginatedGroupsResponseDto> {
        const result = await this.groupsService.findAll(page, limit);
        return {
            data: result.data.map((g) => this.toGroupResponse(g)),
            total: result.total,
            page: result.page,
            limit: result.limit,
        };
    }

    /**
     * Returns all groups the authenticated user belongs to as a member.
     * MUST be declared before GET /:id to avoid route conflict.
     *
     * @param req - Authenticated request object
     * @returns Array of groups the user is a member of
     */
    @Get('my')
    @UseGuards(JwtAuthGuard)
    async findMyGroups(
        @Request() req: { user: { id: string } },
    ): Promise<GroupResponseDto[]> {
        const userId = req.user.id;
        const groups = await this.groupsService.findMyGroups(userId);
        return groups.map((g) => this.toGroupResponse(g));
    }

    /**
     * Returns full group details including members.
     *
     * @param id - The UUID of the group
     * @returns Full group details with members array
     * @throws NotFoundException if the group doesn't exist
     */
    @Get(':id')
    async findOne(
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<GroupResponseDto> {
        const group = await this.groupsService.findOne(id);
        return this.toGroupResponse(group, true);
    }

    /**
     * Updates group metadata. Admin-only — only the group admin may update.
     * Updates are only permitted while the group is in PENDING status.
     *
     * @param req - Authenticated request object
     * @param id - The UUID of the group
     * @param updateGroupDto - Fields to update
     * @returns The updated group
     * @throws NotFoundException if the group doesn't exist
     * @throws BadRequestException if the group is not PENDING
     * @throws ForbiddenException if not the group admin
     */
    @Patch(':id')
    @UseGuards(JwtAuthGuard)
    @AuditLog({ action: 'UPDATE', resource: 'GROUP' })
    async update(
        @Request() req: { user: { id: string; walletAddress: string } },
        @Param('id', ParseUUIDPipe) id: string,
        @Body() updateGroupDto: UpdateGroupDto,
    ): Promise<GroupResponseDto> {
        const adminWallet = req.user.walletAddress || req.user.id;
        const group = await this.groupsService.update(id, updateGroupDto, adminWallet);
        return this.toGroupResponse(group);
    }

    /**
     * Activates a PENDING group if all conditions are met.
     * Only the group admin can activate the group.
     * The group must have enough members to meet the minimum requirement.
     *
     * @param req - Authenticated request object
     * @param id - The UUID of the group to activate
     * @returns The updated group with status ACTIVE
     * @throws NotFoundException if the group doesn't exist
     * @throws ForbiddenException if not the group admin
     * @throws BadRequestException if the group is not PENDING or doesn't have enough members
     */
    @Post(':id/activate')
    @UseGuards(JwtAuthGuard)
    @HttpCode(HttpStatus.OK)
    @AuditLog({ action: 'ACTIVATE', resource: 'GROUP' })
    async activateGroup(
        @Request() req: { user: { id: string; walletAddress: string } },
        @Param('id', ParseUUIDPipe) id: string,
    ): Promise<GroupResponseDto> {
        const adminWallet = req.user.walletAddress || req.user.id;
        const group = await this.groupsService.activateGroup(id, adminWallet);
        return this.toGroupResponse(group);
    }

    /**
     * Maps a Group entity to a GroupResponseDto.
     * @param group - The group entity
     * @param includeMembers - Whether to include the memberships array
     */
    private toGroupResponse(
        group: Group,
        includeMembers = false,
    ): GroupResponseDto {
        const dto: GroupResponseDto = {
            id: group.id,
            name: group.name,
            contractAddress: group.contractAddress,
            adminWallet: group.adminWallet,
            contributionAmount: group.contributionAmount,
            token: group.token,
            roundDuration: group.roundDuration,
            status: group.status,
            currentRound: group.currentRound,
            totalRounds: group.totalRounds,
            createdAt: group.createdAt.toISOString(),
            updatedAt: group.updatedAt.toISOString(),
        };

        if (includeMembers && group.memberships) {
            dto.members = group.memberships.map((m: Membership) =>
                this.toMembershipResponse(m),
            );
        }

        return dto;
    }

    /**
     * Maps a Membership entity to a MembershipResponseDto.
     */
    private toMembershipResponse(membership: Membership): MembershipResponseDto {
        return {
            id: membership.id,
            groupId: membership.groupId,
            userId: membership.userId,
            walletAddress: membership.walletAddress,
            payoutOrder: membership.payoutOrder,
            hasReceivedPayout: membership.hasReceivedPayout,
            hasPaidCurrentRound: membership.hasPaidCurrentRound,
            status: membership.status,
            createdAt: membership.createdAt.toISOString(),
            updatedAt: membership.updatedAt.toISOString(),
        };
    }
}
