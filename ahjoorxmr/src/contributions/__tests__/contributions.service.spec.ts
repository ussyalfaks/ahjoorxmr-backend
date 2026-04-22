import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ContributionsService } from '../contributions.service';
import { Contribution } from '../entities/contribution.entity';
import { Group } from '../../groups/entities/group.entity';
import { GroupStatus } from '../../groups/entities/group-status.enum';
import { StellarService } from '../../stellar/stellar.service';
import { WinstonLogger } from '../../common/logger/winston.logger';
import { CreateContributionDto } from '../dto/create-contribution.dto';
import { RoundService } from '../../groups/round.service';

describe('ContributionsService', () => {
  let service: ContributionsService;
  let contributionRepository: Partial<
    Record<keyof Repository<Contribution>, jest.Mock>
  >;
  let groupRepository: Partial<Record<keyof Repository<Group>, jest.Mock>>;
  let stellarService: Partial<Record<keyof StellarService, jest.Mock>>;
  let configService: Partial<Record<keyof ConfigService, jest.Mock>>;
  let logger: Partial<Record<keyof WinstonLogger, jest.Mock>>;
  let insertQueryBuilder: {
    insert: jest.Mock;
    into: jest.Mock;
    values: jest.Mock;
    orIgnore: jest.Mock;
    execute: jest.Mock;
  };
  let roundService: { tryAdvanceRound: jest.Mock };

  const mockContribution = {
    id: '1',
    groupId: 'group-1',
    userId: 'user-1',
    walletAddress: 'G123',
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
    insertQueryBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({
        identifiers: [{ id: '1' }],
        raw: [],
        generatedMaps: [],
      }),
    };
    roundService = { tryAdvanceRound: jest.fn().mockResolvedValue(undefined) };

    contributionRepository = {
      findOne: jest.fn().mockResolvedValue(mockContribution),
      create: jest.fn(),
      save: jest.fn(),
      findAndCount: jest.fn(),
      createQueryBuilder: jest.fn(() => insertQueryBuilder),
    };
    groupRepository = {
      findOne: jest.fn(),
    };
    stellarService = {
      verifyContribution: jest.fn(),
      verifyContributionForGroup: jest.fn(),
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
        {
          provide: RoundService,
          useValue: roundService,
        },
      ],
    }).compile();

    service = module.get<ContributionsService>(ContributionsService);
  });

  describe('createContribution', () => {
    it('should create a contribution when verification is disabled', async () => {
      configService.get!.mockReturnValue(false); // VERIFY_CONTRIBUTIONS = false
      groupRepository.findOne!.mockResolvedValue({
        id: 'group-1',
        status: GroupStatus.ACTIVE,
        currentRound: 1,
      });
      const result = await service.createContribution(createContributionDto);

      expect(result).toEqual(mockContribution);
      expect(stellarService.verifyContributionForGroup).not.toHaveBeenCalled();
      expect(insertQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should create a contribution when verification is enabled and successful', async () => {
      configService.get!.mockReturnValue(true); // VERIFY_CONTRIBUTIONS = true
      stellarService.verifyContributionForGroup!.mockResolvedValue(true);
      groupRepository.findOne!.mockResolvedValue({
        id: 'group-1',
        status: GroupStatus.ACTIVE,
        currentRound: 1,
      });

      const result = await service.createContribution(createContributionDto);

      expect(result).toEqual(mockContribution);
      expect(stellarService.verifyContributionForGroup).toHaveBeenCalledWith(
        '0x123',
        null,
      );
      expect(insertQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should throw ConflictException when INSERT hits unique constraint (23505)', async () => {
      configService.get!.mockReturnValue(false);
      groupRepository.findOne!.mockResolvedValue({
        id: 'group-1',
        status: GroupStatus.ACTIVE,
        currentRound: 1,
      });

      const dbError = new QueryFailedError('', [], new Error());
      (dbError as any).code = '23505';
      (dbError as any).constraint = 'UQ_contributions_transactionHash';

      insertQueryBuilder.execute.mockRejectedValueOnce(dbError);

      await expect(
        service.createContribution(createContributionDto),
      ).rejects.toThrow('Contribution with this transaction hash already exists');
    });

    it('should throw ConflictException when ON CONFLICT suppresses insert (duplicate user/round)', async () => {
      configService.get!.mockReturnValue(false);
      groupRepository.findOne!.mockResolvedValue({
        id: 'group-1',
        status: GroupStatus.ACTIVE,
        currentRound: 1,
      });
      insertQueryBuilder.execute.mockResolvedValueOnce({
        identifiers: [],
        raw: [],
        generatedMaps: [],
      });

      await expect(
        service.createContribution(createContributionDto),
      ).rejects.toThrow(
        'A contribution for this user and round already exists in this group, or this transaction was already recorded',
      );
    });

    it('should throw BadRequestException when group does not exist', async () => {
      groupRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.createContribution(createContributionDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should use group contractAddress when available', async () => {
      const groupWithContract = {
        id: 'group-1',
        status: GroupStatus.ACTIVE,
        currentRound: 1,
        contractAddress:
          'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      };
      configService.get!.mockReturnValue(true);
      groupRepository.findOne!.mockResolvedValue(groupWithContract);
      stellarService.verifyContributionForGroup!.mockResolvedValue(true);
      contributionRepository.findOne!.mockResolvedValue(mockContribution);

      const result = await service.createContribution(createContributionDto);

      expect(result).toEqual(mockContribution);
      expect(stellarService.verifyContributionForGroup).toHaveBeenCalledWith(
        '0x123',
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      );
      expect(insertQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should fall back to global contract address when group contractAddress is null', async () => {
      const groupWithoutContract = {
        id: 'group-1',
        status: GroupStatus.ACTIVE,
        currentRound: 1,
        contractAddress: null,
      };
      configService.get!.mockReturnValue(true);
      groupRepository.findOne!.mockResolvedValue(groupWithoutContract);
      stellarService.verifyContributionForGroup!.mockResolvedValue(true);
      contributionRepository.findOne!.mockResolvedValue(mockContribution);

      const result = await service.createContribution(createContributionDto);

      expect(result).toEqual(mockContribution);
      expect(stellarService.verifyContributionForGroup).toHaveBeenCalledWith(
        '0x123',
        null,
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('falling back to global CONTRACT_ADDRESS'),
        'ContributionsService',
      );
      expect(insertQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should throw BadRequestException when verification fails against group contract', async () => {
      const groupWithContract = {
        id: 'group-1',
        status: GroupStatus.ACTIVE,
        currentRound: 1,
        contractAddress:
          'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      };
      configService.get!.mockReturnValue(true);
      groupRepository.findOne!.mockResolvedValue(groupWithContract);
      stellarService.verifyContributionForGroup!.mockResolvedValue(false);

      await expect(
        service.createContribution(createContributionDto),
      ).rejects.toThrow(BadRequestException);
      expect(insertQueryBuilder.execute).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when verification fails against global contract', async () => {
      const groupWithoutContract = {
        id: 'group-1',
        status: GroupStatus.ACTIVE,
        currentRound: 1,
        contractAddress: null,
      };
      configService.get!.mockReturnValue(true);
      groupRepository.findOne!.mockResolvedValue(groupWithoutContract);
      stellarService.verifyContributionForGroup!.mockResolvedValue(false);

      await expect(
        service.createContribution(createContributionDto),
      ).rejects.toThrow(BadRequestException);
      expect(insertQueryBuilder.execute).not.toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Round Number Validation Tests
    // -------------------------------------------------------------------------

    it('should throw BadRequestException when contribution is for a future round', async () => {
      const futureRoundDto: CreateContributionDto = {
        ...createContributionDto,
        roundNumber: 5, // Future round
      };
      const group = {
        id: 'group-1',
        status: GroupStatus.ACTIVE,
        currentRound: 1, // Current round is 1
      };

      configService.get!.mockReturnValue(false);
      groupRepository.findOne!.mockResolvedValue(group);

      await expect(service.createContribution(futureRoundDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createContribution(futureRoundDto)).rejects.toThrow(
        'Contributions can only be made for the current round',
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Round number mismatch'),
        'ContributionsService',
      );
      expect(insertQueryBuilder.execute).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when contribution is for a past round', async () => {
      const pastRoundDto: CreateContributionDto = {
        ...createContributionDto,
        roundNumber: 1, // Past round
      };
      const group = {
        id: 'group-1',
        status: GroupStatus.ACTIVE,
        currentRound: 5, // Current round is 5
      };

      configService.get!.mockReturnValue(false);
      groupRepository.findOne!.mockResolvedValue(group);

      await expect(service.createContribution(pastRoundDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.createContribution(pastRoundDto)).rejects.toThrow(
        'Contributions can only be made for the current round',
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Round number mismatch'),
        'ContributionsService',
      );
      expect(insertQueryBuilder.execute).not.toHaveBeenCalled();
    });

    it('should succeed when roundNumber matches group currentRound', async () => {
      const correctRoundDto: CreateContributionDto = {
        ...createContributionDto,
        roundNumber: 3,
      };
      const group = {
        id: 'group-1',
        status: GroupStatus.ACTIVE,
        currentRound: 3, // Matches the DTO
      };

      configService.get!.mockReturnValue(false);
      groupRepository.findOne!.mockResolvedValue(group);
      contributionRepository.findOne!.mockResolvedValue({
        ...mockContribution,
        roundNumber: 3,
      });

      const result = await service.createContribution(correctRoundDto);

      expect(result.roundNumber).toBe(3);
      expect(insertQueryBuilder.execute).toHaveBeenCalled();
    });

    // -------------------------------------------------------------------------
    // Group Status Validation Tests
    // -------------------------------------------------------------------------

    it('should throw BadRequestException when group status is PENDING', async () => {
      const group = {
        id: 'group-1',
        status: GroupStatus.PENDING,
        currentRound: 0,
      };

      configService.get!.mockReturnValue(false);
      groupRepository.findOne!.mockResolvedValue(group);

      await expect(
        service.createContribution(createContributionDto),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createContribution(createContributionDto),
      ).rejects.toThrow('Contributions can only be made to ACTIVE groups');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cannot create contribution'),
        'ContributionsService',
      );
      expect(insertQueryBuilder.execute).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when group status is COMPLETED', async () => {
      const group = {
        id: 'group-1',
        status: GroupStatus.COMPLETED,
        currentRound: 10,
      };

      configService.get!.mockReturnValue(false);
      groupRepository.findOne!.mockResolvedValue(group);

      await expect(
        service.createContribution(createContributionDto),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createContribution(createContributionDto),
      ).rejects.toThrow('Contributions can only be made to ACTIVE groups');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cannot create contribution'),
        'ContributionsService',
      );
      expect(insertQueryBuilder.execute).not.toHaveBeenCalled();
    });

    it('should succeed when group status is ACTIVE and round matches', async () => {
      const group = {
        id: 'group-1',
        status: GroupStatus.ACTIVE,
        currentRound: 1,
      };

      configService.get!.mockReturnValue(false);
      groupRepository.findOne!.mockResolvedValue(group);
      contributionRepository.findOne!.mockResolvedValue(mockContribution);

      const result = await service.createContribution(createContributionDto);

      expect(result).toEqual(mockContribution);
      expect(insertQueryBuilder.execute).toHaveBeenCalled();
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
