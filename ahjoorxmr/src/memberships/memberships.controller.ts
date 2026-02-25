import {
  Controller,
  Post,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Body,
  ParseUUIDPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { MembershipsService } from './memberships.service';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { MembershipResponseDto } from './dto/membership-response.dto';
import { RecordPayoutDto } from './dto/record-payout.dto';
import { JwtAuthGuard } from '../groups/guards/jwt-auth.guard';

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

    return {
      id: membership.id,
      groupId: membership.groupId,
      userId: membership.userId,
      walletAddress: membership.walletAddress,
      payoutOrder: membership.payoutOrder,
      hasReceivedPayout: membership.hasReceivedPayout,
      hasPaidCurrentRound: membership.hasPaidCurrentRound,
      transactionHash: membership.transactionHash,
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

    return memberships.map((membership) => ({
      id: membership.id,
      groupId: membership.groupId,
      userId: membership.userId,
      walletAddress: membership.walletAddress,
      payoutOrder: membership.payoutOrder,
      hasReceivedPayout: membership.hasReceivedPayout,
      hasPaidCurrentRound: membership.hasPaidCurrentRound,
      transactionHash: membership.transactionHash,
      status: membership.status,
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
    }));
  }

  /**
   * Records a payout to a member.
   * Admin-only endpoint that marks a member as having received their payout.
   *
   * @param groupId - The UUID of the group
   * @param recordPayoutDto - Payout details (recipientUserId and transactionHash)
   * @returns The updated membership with HTTP 200 status
   * @throws NotFoundException if group or membership doesn't exist
   * @throws BadRequestException if group is not ACTIVE
   * @throws ConflictException if member already received payout
   */
  @Post(':id/payout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async recordPayout(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Body() recordPayoutDto: RecordPayoutDto,
  ): Promise<MembershipResponseDto> {
    const membership = await this.membershipsService.recordPayout(
      groupId,
      recordPayoutDto.recipientUserId,
      recordPayoutDto.transactionHash,
    );

    return {
      id: membership.id,
      groupId: membership.groupId,
      userId: membership.userId,
      walletAddress: membership.walletAddress,
      payoutOrder: membership.payoutOrder,
      hasReceivedPayout: membership.hasReceivedPayout,
      hasPaidCurrentRound: membership.hasPaidCurrentRound,
      transactionHash: membership.transactionHash,
      status: membership.status,
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
    };
  }
}
