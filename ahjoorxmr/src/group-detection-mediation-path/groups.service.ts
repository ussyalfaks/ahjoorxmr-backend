import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from './entities/group.entity';
import { GroupStatus } from './enums/group-status.enum';
import { ListGroupsDto } from './dto/list-groups.dto';
import { NotificationsService } from '../notifications/notifications.service';

export interface PaginatedGroups {
  data: Group[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(dto: ListGroupsDto): Promise<PaginatedGroups> {
    const { status, page = 1, limit = 20 } = dto;

    const qb = this.groupRepository.createQueryBuilder('group');

    if (status) {
      qb.andWhere('group.status = :status', { status });
    }

    qb.orderBy('group.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<Group> {
    const group = await this.groupRepository.findOne({ where: { id } });

    if (!group) {
      throw new NotFoundException(`Group with id "${id}" not found`);
    }

    return group;
  }

  async reactivate(
    groupId: string,
    requestingAdminId: string,
    reason: string,
  ): Promise<Group> {
    const group = await this.findById(groupId);

    if (group.status !== GroupStatus.STALE) {
      throw new ConflictException(
        `Group "${group.name}" is not in STALE status and cannot be reactivated (current status: ${group.status})`,
      );
    }

    this.logger.log(
      `Reactivating group "${group.name}" (${groupId}) by admin ${requestingAdminId}. Reason: ${reason}`,
    );

    group.staleAt = null;
    group.status = GroupStatus.ACTIVE;
    group.lastActiveAt = new Date();

    const saved = await this.groupRepository.save(group);

    // Notify the group admin that the group has been reactivated
    await this.notificationsService.notifyGroupReactivated(group.adminId, {
      groupId: group.id,
      groupName: group.name,
      reason,
    });

    return saved;
  }
}
