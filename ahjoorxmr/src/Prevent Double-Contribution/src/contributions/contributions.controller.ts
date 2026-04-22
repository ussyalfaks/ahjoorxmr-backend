import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { ContributionsService } from './contributions.service';
import { CreateContributionDto } from './dto/create-contribution.dto';
import { Contribution } from './contribution.entity';

@Controller('contributions')
export class ContributionsController {
  constructor(private readonly contributionsService: ContributionsService) {}

  @Post()
  async create(@Body() createContributionDto: CreateContributionDto): Promise<Contribution> {
    return this.contributionsService.createContribution(createContributionDto);
  }

  @Get()
  async findAll(): Promise<Contribution[]> {
    return this.contributionsService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Contribution> {
    return this.contributionsService.findById(id);
  }

  @Get('by-group/:groupId/:userId')
  async findByGroupAndUser(
    @Param('groupId') groupId: string,
    @Param('userId') userId: string,
  ): Promise<Contribution[]> {
    return this.contributionsService.findByGroupAndUser(groupId, userId);
  }

  @Get('by-round/:groupId/:roundNumber')
  async findByRound(
    @Param('groupId') groupId: string,
    @Param('roundNumber') roundNumber: string,
  ): Promise<Contribution[]> {
    return this.contributionsService.findByRound(groupId, parseInt(roundNumber, 10));
  }
}
