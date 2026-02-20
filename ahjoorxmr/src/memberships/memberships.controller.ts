import { Controller, Post, Delete, Get, HttpCode, HttpStatus, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { MembershipResponseDto } from './dto/membership-response.dto';

/**
 * Controller for managing ROSCA group memberships.
 * Provides REST API endpoints for adding, removing, and listing group members.
 */
@Controller('api/v1/groups')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  /**
   * Adds a new member to a ROSCA group.
   * Only allowed before the group becomes active.
   *
   * @param groupId - The UUID of the group (validated by ParseUUIDPipe)
   * @param createMembershipDto - The membership data (userId and walletAddress)
   * @returns The created membership with HTTP 201 status
   * @throws BadRequestException if the group is active or doesn't exist
   * @throws ConflictException if the user is already a member
   */
  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  async addMember(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Body() createMembershipDto: CreateMembershipDto,
  ): Promise<MembershipResponseDto> {
    const membership = await this.membershipsService.addMember(
      groupId,
      createMembershipDto,
    );

    // Transform entity to response DTO
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

  /**
   * Removes a member from a ROSCA group.
   * Only allowed before the group becomes active.
   *
   * @param groupId - The UUID of the group (validated by ParseUUIDPipe)
   * @param userId - The UUID of the user to remove (validated by ParseUUIDPipe)
   * @returns No content with HTTP 204 status
   * @throws BadRequestException if the group is active or doesn't exist
   * @throws NotFoundException if the membership doesn't exist
   */
  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.membershipsService.removeMember(groupId, userId);
  }

  /**
   * Lists all members of a ROSCA group.
   * Returns members ordered by payout order (position in the payout queue).
   *
   * @param groupId - The UUID of the group (validated by ParseUUIDPipe)
   * @returns Array of memberships with HTTP 200 status
   */
  @Get(':id/members')
  async listMembers(
    @Param('id', ParseUUIDPipe) groupId: string,
  ): Promise<MembershipResponseDto[]> {
    const memberships = await this.membershipsService.listMembers(groupId);

    // Transform entities to response DTOs
    return memberships.map((membership) => ({
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
    }));
  }

}

