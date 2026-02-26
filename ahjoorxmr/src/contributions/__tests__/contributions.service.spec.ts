import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContributionsService } from '../contributions.service';
import { Contribution } from '../entities/contribution.entity';
import { Group } from '../../groups/entities/group.entity';
import { StellarService } from '../../stellar/stellar.service';
import { WinstonLogger } from '../../common/logger/winston.logger';
import { CreateContributionDto } from '../dto/create-contribution.dto';

describe('ContributionsService', () => {
  let service: ContributionsService;
  let contributionRepository: Partial<
    Record<keyof Repository<Contribution>, jest.Mock>
  >;
  let groupRepository: Partial<Record<keyof Repository<Group>, jest.Mock>>;
  let stellarService: Partial<Record<keyof StellarService, jest.Mock>>;
  let configService: Partial<Record<keyof ConfigService, jest.Mock>>;
  let logger: Partial<Record<keyof WinstonLogger, jest.Mock>>;

  const mockContribution = {
    id: '1',
    groupId: 'group-1',
    userId: 'user-1',
    transactionHash: '0x123',
    amount: '100',
    roundNumber: 1,
    timestamp: new Date(),
  };

  const createContributionDto: CreateContributionDto = {
    groupId: 'group-1',
    userId: 'user-1',
    walletAddress: 'G123',
    transactionHash: '0x123',
    amount: '100',
    roundNumber: 1,
    timestamp: new Date(),
  };

  beforeEach(async () => {
    contributionRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      findAndCount: jest.fn(),
    };
    groupRepository = {
      findOne: jest.fn(),
    };
    stellarService = {
      verifyContribution: jest.fn(),
    };
    configService = {
      get: jest.fn(),
    };
    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContributionsService,
        {
          provide: getRepositoryToken(Contribution),
          useValue: contributionRepository,
        },
        {
          provide: getRepositoryToken(Group),
          useValue: groupRepository,
        },
        {
          provide: StellarService,
          useValue: stellarService,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
        {
          provide: WinstonLogger,
          useValue: logger,
        },
      ],
    }).compile();

    service = module.get<ContributionsService>(ContributionsService);
  });

  describe('createContribution', () => {
    it('should create a contribution when verification is disabled', async () => {
      configService.get!.mockReturnValue(false); // VERIFY_CONTRIBUTIONS = false
      groupRepository.findOne!.mockResolvedValue({ id: 'group-1' });
      contributionRepository.findOne!.mockResolvedValue(null); // No duplicate hash
      contributionRepository.create!.mockReturnValue(mockContribution);
      contributionRepository.save!.mockResolvedValue(mockContribution);

      const result = await service.createContribution(createContributionDto);

      expect(result).toEqual(mockContribution);
      expect(stellarService.verifyContribution).not.toHaveBeenCalled();
      expect(contributionRepository.save).toHaveBeenCalled();
    });

    it('should create a contribution when verification is enabled and successful', async () => {
      configService.get!.mockReturnValue(true); // VERIFY_CONTRIBUTIONS = true
      stellarService.verifyContribution!.mockResolvedValue(true);
      groupRepository.findOne!.mockResolvedValue({ id: 'group-1' });
      contributionRepository.findOne!.mockResolvedValue(null);
      contributionRepository.create!.mockReturnValue(mockContribution);
      contributionRepository.save!.mockResolvedValue(mockContribution);

      const result = await service.createContribution(createContributionDto);

      expect(result).toEqual(mockContribution);
      expect(stellarService.verifyContribution).toHaveBeenCalledWith('0x123');
      expect(contributionRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException when verification fails', async () => {
      configService.get!.mockReturnValue(true);
      stellarService.verifyContribution!.mockResolvedValue(false);
      groupRepository.findOne!.mockResolvedValue({ id: 'group-1' });

      await expect(
        service.createContribution(createContributionDto),
      ).rejects.toThrow(BadRequestException);
      expect(contributionRepository.save).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when transaction hash already exists', async () => {
      configService.get!.mockReturnValue(true);
      stellarService.verifyContribution!.mockResolvedValue(true);
      groupRepository.findOne!.mockResolvedValue({ id: 'group-1' });
      contributionRepository.findOne!.mockResolvedValue(mockContribution);

      await expect(
        service.createContribution(createContributionDto),
      ).rejects.toThrow(ConflictException);
      expect(contributionRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when group does not exist', async () => {
      groupRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.createContribution(createContributionDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getGroupContributions', () => {
    it('should return paginated contributions with default values', async () => {
      const mockResult = [[mockContribution], 1];
      contributionRepository.findAndCount!.mockResolvedValue(mockResult);

      const result = await service.getGroupContributions('group-1', {});

      expect(result.data).toEqual([mockContribution]);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(1);
      expect(contributionRepository.findAndCount).toHaveBeenCalledWith({
        where: { groupId: 'group-1' },
        order: { timestamp: 'DESC' },
        skip: 0,
        take: 20,
      });
    });

    it('should apply pagination and sorting correctly', async () => {
      const mockResult = [[mockContribution], 1];
      contributionRepository.findAndCount!.mockResolvedValue(mockResult);

      const query = {
        page: 2,
        limit: 10,
        sortBy: 'amount',
        sortOrder: 'ASC' as const,
      };

      await service.getGroupContributions('group-1', query);

      expect(contributionRepository.findAndCount).toHaveBeenCalledWith({
        where: { groupId: 'group-1' },
        order: { amount: 'ASC' },
        skip: 10,
        take: 10,
      });
    });

    it('should filter by round and walletAddress', async () => {
      const mockResult = [[mockContribution], 1];
      contributionRepository.findAndCount!.mockResolvedValue(mockResult);

      const query = {
        round: 2,
        walletAddress: 'G123',
      };

      await service.getGroupContributions('group-1', query);

      expect(contributionRepository.findAndCount).toHaveBeenCalledWith({
        where: {
          groupId: 'group-1',
          roundNumber: 2,
          walletAddress: 'G123',
        },
        order: { timestamp: 'DESC' },
        skip: 0,
        take: 20,
      });
    });
  });
});
