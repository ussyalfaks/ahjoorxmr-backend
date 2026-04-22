import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contribution } from './contribution.entity';
import { CreateContributionDto } from './dto/create-contribution.dto';

@Injectable()
export class ContributionsService {
  constructor(
    @InjectRepository(Contribution)
    private readonly contributionRepository: Repository<Contribution>,
  ) {}

  async createContribution(createContributionDto: CreateContributionDto): Promise<Contribution> {
    const { groupId, userId, roundNumber } = createContributionDto;

    // Explicitly check for an existing contribution for the same round
    const existingContribution = await this.contributionRepository.findOne({
      where: {
        groupId,
        userId,
        roundNumber,
      },
    });

    if (existingContribution) {
      throw new ConflictException(
        `You have already contributed for round ${roundNumber} in this group`,
      );
    }

    // Create and save the new contribution
    const contribution = this.contributionRepository.create(createContributionDto);
    return this.contributionRepository.save(contribution);
  }

  async findAll(): Promise<Contribution[]> {
    return this.contributionRepository.find();
  }

  async findById(id: string): Promise<Contribution> {
    return this.contributionRepository.findOne({ where: { id } });
  }

  async findByGroupAndUser(groupId: string, userId: string): Promise<Contribution[]> {
    return this.contributionRepository.find({
      where: {
        groupId,
        userId,
      },
    });
  }

  async findByRound(groupId: string, roundNumber: number): Promise<Contribution[]> {
    return this.contributionRepository.find({
      where: {
        groupId,
        roundNumber,
      },
    });
  }
}
