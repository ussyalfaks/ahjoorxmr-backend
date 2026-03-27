import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contribution } from './entities/contribution.entity';
import { CreateContributionDto } from './dto/create-contribution.dto';
import { GroupsService } from '../groups/groups.service';
import { GroupStatus } from '../groups/enums/group-status.enum';

@Injectable()
export class ContributionsService {
  private readonly logger = new Logger(ContributionsService.name);

  constructor(
    @InjectRepository(Contribution)
    private readonly contributionRepository: Repository<Contribution>,
    private readonly groupsService: GroupsService,
  ) {}

  async create(
    userId: string,
    dto: CreateContributionDto,
  ): Promise<Contribution> {
    const group = await this.groupsService.findById(dto.groupId);

    // Guard: reject contributions to stale groups
    if (group.status === GroupStatus.STALE) {
      throw new ConflictException(
        `Cannot contribute to group "${group.name}" because it is currently STALE. ` +
          `Please wait for an admin to reactivate the group.`,
      );
    }

    // Guard: reject contributions to archived/inactive groups
    if (
      group.status === GroupStatus.ARCHIVED ||
      group.status === GroupStatus.INACTIVE
    ) {
      throw new ConflictException(
        `Cannot contribute to group "${group.name}" because it is ${group.status}.`,
      );
    }

    this.logger.log(
      `Recording contribution from user ${userId} to group ${dto.groupId} for round ${group.currentRound}`,
    );

    const contribution = this.contributionRepository.create({
      userId,
      groupId: dto.groupId,
      amount: dto.amount,
      round: group.currentRound,
    });

    return this.contributionRepository.save(contribution);
  }

  async findByGroup(groupId: string): Promise<Contribution[]> {
    const group = await this.groupsService.findById(groupId);

    if (!group) {
      throw new NotFoundException(`Group "${groupId}" not found`);
    }

    return this.contributionRepository.find({
      where: { groupId },
      order: { createdAt: 'DESC' },
    });
  }
}
