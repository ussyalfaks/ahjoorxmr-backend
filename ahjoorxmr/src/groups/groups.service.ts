import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from './entities/group.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { WinstonLogger } from '../common/logger/winston.logger';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupStatus } from './entities/group-status.enum';

/**
 * Service responsible for managing ROSCA group operations.
 * Handles business logic for creating, reading, and updating groups.
 * Does NOT interact with smart contracts — that is handled by the Stellar service.
 */
@Injectable()
export class GroupsService {
    constructor(
        @InjectRepository(Group)
        private readonly groupRepository: Repository<Group>,
        @InjectRepository(Membership)
        private readonly membershipRepository: Repository<Membership>,
        private readonly logger: WinstonLogger,
    ) { }

    /**
     * Creates a new ROSCA group with status PENDING.
     * The adminWallet is taken from the authenticated user's wallet (passed in, not from DTO).
     *
     * @param createGroupDto - Group creation data
     * @param adminWallet - Wallet address of the authenticated admin user
     * @returns The created Group entity
     */
    async createGroup(
        createGroupDto: CreateGroupDto,
        adminWallet: string,
    ): Promise<Group> {
        this.logger.log(
            `Creating group "${createGroupDto.name}" for admin ${adminWallet}`,
            'GroupsService',
        );

        try {
            const group = this.groupRepository.create({
                ...createGroupDto,
                adminWallet,
                status: GroupStatus.PENDING,
                currentRound: 0,
                contractAddress: createGroupDto.contractAddress ?? null,
            });

            const savedGroup = await this.groupRepository.save(group);

            this.logger.log(
                `Group created with id ${savedGroup.id} for admin ${adminWallet}`,
                'GroupsService',
            );

            return savedGroup;
        } catch (error) {
            this.logger.error(
                `Failed to create group for admin ${adminWallet}: ${error.message}`,
                error.stack,
                'GroupsService',
            );
            throw error;
        }
    }

    /**
     * Returns a paginated list of all ROSCA groups ordered by creation date (newest first).
     *
     * @param page - Page number (1-indexed)
     * @param limit - Number of items per page
     * @returns Paginated result with data, total count, page, and limit
     */
    async findAll(
        page: number = 1,
        limit: number = 10,
    ): Promise<{ data: Group[]; total: number; page: number; limit: number }> {
        this.logger.log(
            `Fetching groups page=${page} limit=${limit}`,
            'GroupsService',
        );

        try {
            const skip = (page - 1) * limit;

            const [data, total] = await this.groupRepository.findAndCount({
                order: { createdAt: 'DESC' },
                skip,
                take: limit,
            });

            this.logger.log(
                `Found ${total} group(s); returning page ${page}`,
                'GroupsService',
            );

            return { data, total, page, limit };
        } catch (error) {
            this.logger.error(
                `Failed to fetch groups: ${error.message}`,
                error.stack,
                'GroupsService',
            );
            throw error;
        }
    }

    /**
     * Returns full group details including its members.
     *
     * @param id - The UUID of the group
     * @returns The Group entity with populated memberships
     * @throws NotFoundException if the group doesn't exist
     */
    async findOne(id: string): Promise<Group> {
        this.logger.log(`Fetching group ${id}`, 'GroupsService');

        try {
            const group = await this.groupRepository.findOne({
                where: { id },
                relations: ['memberships'],
            });

            if (!group) {
                this.logger.warn(`Group ${id} not found`, 'GroupsService');
                throw new NotFoundException(`Group with id ${id} not found`);
            }

            return group;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error(
                `Failed to fetch group ${id}: ${error.message}`,
                error.stack,
                'GroupsService',
            );
            throw error;
        }
    }

    /**
     * Updates group metadata. Only allowed when the group is in PENDING status.
     * Throws BadRequestException if the group is ACTIVE or COMPLETED.
     *
     * @param id - The UUID of the group
     * @param updateGroupDto - Fields to update
     * @param requestingAdminWallet - Wallet address of the requesting user (must be group admin)
     * @returns The updated Group entity
     * @throws NotFoundException if the group doesn't exist
     * @throws BadRequestException if the group is not PENDING
     * @throws ForbiddenException if the requester is not the group admin
     */
    async update(
        id: string,
        updateGroupDto: UpdateGroupDto,
        requestingAdminWallet: string,
    ): Promise<Group> {
        this.logger.log(
            `Updating group ${id} by admin ${requestingAdminWallet}`,
            'GroupsService',
        );

        try {
            const group = await this.groupRepository.findOne({ where: { id } });

            if (!group) {
                this.logger.warn(`Group ${id} not found for update`, 'GroupsService');
                throw new NotFoundException(`Group with id ${id} not found`);
            }

            if (group.adminWallet !== requestingAdminWallet) {
                this.logger.warn(
                    `Admin wallet mismatch: ${requestingAdminWallet} is not the admin of group ${id}`,
                    'GroupsService',
                );
                throw new ForbiddenException(
                    'Only the group admin can update this group',
                );
            }

            if (group.status !== GroupStatus.PENDING) {
                this.logger.warn(
                    `Cannot update group ${id} with status ${group.status}`,
                    'GroupsService',
                );
                throw new BadRequestException(
                    `Cannot update group metadata after it becomes ${group.status}. Only PENDING groups can be updated.`,
                );
            }

            Object.assign(group, updateGroupDto);
            const savedGroup = await this.groupRepository.save(group);

            this.logger.log(`Group ${id} updated successfully`, 'GroupsService');

            return savedGroup;
        } catch (error) {
            if (
                error instanceof NotFoundException ||
                error instanceof BadRequestException ||
                error instanceof ForbiddenException
            ) {
                throw error;
            }
            this.logger.error(
                `Failed to update group ${id}: ${error.message}`,
                error.stack,
                'GroupsService',
            );
            throw error;
        }
    }

    /**
     * Returns all groups that the authenticated user (by userId) belongs to as a member.
     *
     * @param userId - The UUID of the authenticated user
     * @returns Array of Group entities the user is a member of
     */
    async findMyGroups(userId: string): Promise<Group[]> {
        this.logger.log(`Fetching groups for user ${userId}`, 'GroupsService');

        try {
            const memberships = await this.membershipRepository.find({
                where: { userId },
                relations: ['group'],
            });

            const groups = memberships.map((m) => m.group).filter(Boolean);

            this.logger.log(
                `Found ${groups.length} group(s) for user ${userId}`,
                'GroupsService',
            );

            return groups;
        } catch (error) {
            this.logger.error(
                `Failed to fetch groups for user ${userId}: ${error.message}`,
                error.stack,
                'GroupsService',
            );
            throw error;
        }
    }
}
