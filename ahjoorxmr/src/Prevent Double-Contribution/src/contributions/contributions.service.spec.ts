import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException } from '@nestjs/common';
import { ContributionsService } from './contributions.service';
import { Contribution } from './contribution.entity';
import { CreateContributionDto } from './dto/create-contribution.dto';

describe('ContributionsService', () => {
  let service: ContributionsService;
  let repository: Repository<Contribution>;

  const mockContribution: Contribution = {
    id: '1',
    groupId: 'group-1',
    userId: 'user-1',
    roundNumber: 1,
    transactionHash: 'hash-1',
    amount: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContributionsService,
        {
          provide: getRepositoryToken(Contribution),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ContributionsService>(ContributionsService);
    repository = module.get<Repository<Contribution>>(getRepositoryToken(Contribution));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createContribution', () => {
    it('should create a contribution when none exists for the same round', async () => {
      const createContributionDto: CreateContributionDto = {
        groupId: 'group-1',
        userId: 'user-1',
        roundNumber: 1,
        transactionHash: 'hash-1',
        amount: 100,
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockContribution);
      mockRepository.save.mockResolvedValue(mockContribution);

      const result = await service.createContribution(createContributionDto);

      expect(result).toEqual(mockContribution);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          groupId: 'group-1',
          userId: 'user-1',
          roundNumber: 1,
        },
      });
      expect(mockRepository.create).toHaveBeenCalledWith(createContributionDto);
      expect(mockRepository.save).toHaveBeenCalledWith(mockContribution);
    });

    it('should throw ConflictException when contribution already exists for the same round', async () => {
      const createContributionDto: CreateContributionDto = {
        groupId: 'group-1',
        userId: 'user-1',
        roundNumber: 1,
        transactionHash: 'hash-2',
        amount: 200,
      };

      mockRepository.findOne.mockResolvedValue(mockContribution);

      await expect(service.createContribution(createContributionDto)).rejects.toThrow(
        new ConflictException('You have already contributed for round 1 in this group'),
      );

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          groupId: 'group-1',
          userId: 'user-1',
          roundNumber: 1,
        },
      });
      expect(mockRepository.create).not.toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should allow contribution from a different round for the same member', async () => {
      const createContributionDto: CreateContributionDto = {
        groupId: 'group-1',
        userId: 'user-1',
        roundNumber: 2,
        transactionHash: 'hash-2',
        amount: 150,
      };

      const mockContribution2 = {
        ...mockContribution,
        roundNumber: 2,
        transactionHash: 'hash-2',
        amount: 150,
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockContribution2);
      mockRepository.save.mockResolvedValue(mockContribution2);

      const result = await service.createContribution(createContributionDto);

      expect(result).toEqual(mockContribution2);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          groupId: 'group-1',
          userId: 'user-1',
          roundNumber: 2,
        },
      });
      expect(mockRepository.save).toHaveBeenCalledWith(mockContribution2);
    });
  });

  describe('findAll', () => {
    it('should return all contributions', async () => {
      mockRepository.find.mockResolvedValue([mockContribution]);

      const result = await service.findAll();

      expect(result).toEqual([mockContribution]);
      expect(mockRepository.find).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should return a contribution by id', async () => {
      mockRepository.findOne.mockResolvedValue(mockContribution);

      const result = await service.findById('1');

      expect(result).toEqual(mockContribution);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });
  });

  describe('findByGroupAndUser', () => {
    it('should return contributions for a specific group and user', async () => {
      mockRepository.find.mockResolvedValue([mockContribution]);

      const result = await service.findByGroupAndUser('group-1', 'user-1');

      expect(result).toEqual([mockContribution]);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          groupId: 'group-1',
          userId: 'user-1',
        },
      });
    });
  });

  describe('findByRound', () => {
    it('should return contributions for a specific group and round', async () => {
      mockRepository.find.mockResolvedValue([mockContribution]);

      const result = await service.findByRound('group-1', 1);

      expect(result).toEqual([mockContribution]);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: {
          groupId: 'group-1',
          roundNumber: 1,
        },
      });
    });
  });
});
