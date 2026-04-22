import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ConflictException } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContributionsService } from './contributions.service';
import { ContributionsController } from './contributions.controller';
import { Contribution } from './contribution.entity';
import { CreateContributionDto } from './dto/create-contribution.dto';

describe('ContributionsService Integration Tests', () => {
  let app: INestApplication;
  let service: ContributionsService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Contribution],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([Contribution]),
      ],
      controllers: [ContributionsController],
      providers: [ContributionsService],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    service = module.get<ContributionsService>(ContributionsService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Prevent Double Contribution', () => {
    const groupId = 'test-group-1';
    const userId = 'test-user-1';
    const roundNumber = 1;

    const firstContribution: CreateContributionDto = {
      groupId,
      userId,
      roundNumber,
      transactionHash: 'hash-001',
      amount: 100,
    };

    const secondContribution: CreateContributionDto = {
      groupId,
      userId,
      roundNumber,
      transactionHash: 'hash-002',
      amount: 50,
    };

    const differentRoundContribution: CreateContributionDto = {
      groupId,
      userId,
      roundNumber: 2,
      transactionHash: 'hash-003',
      amount: 75,
    };

    it('should successfully create the first contribution for a round', async () => {
      const result = await service.createContribution(firstContribution);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.groupId).toBe(groupId);
      expect(result.userId).toBe(userId);
      expect(result.roundNumber).toBe(roundNumber);
      expect(result.transactionHash).toBe('hash-001');
      expect(result.amount).toBe(100);
    });

    it('should return 409 Conflict when trying to contribute twice for the same round', async () => {
      let conflictError: ConflictException;

      try {
        await service.createContribution(secondContribution);
      } catch (error) {
        conflictError = error;
      }

      expect(conflictError).toBeDefined();
      expect(conflictError).toBeInstanceOf(ConflictException);
      expect(conflictError.getResponse()).toEqual({
        error: 'Conflict',
        message: 'You have already contributed for round 1 in this group',
        statusCode: 409,
      });
    });

    it('should allow contribution from a different round for the same member', async () => {
      const result = await service.createContribution(differentRoundContribution);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.groupId).toBe(groupId);
      expect(result.userId).toBe(userId);
      expect(result.roundNumber).toBe(2);
      expect(result.transactionHash).toBe('hash-003');
      expect(result.amount).toBe(75);
    });

    it('should allow the same user to contribute to different groups in the same round', async () => {
      const differentGroupContribution: CreateContributionDto = {
        groupId: 'test-group-2',
        userId,
        roundNumber: 1,
        transactionHash: 'hash-004',
        amount: 120,
      };

      const result = await service.createContribution(differentGroupContribution);

      expect(result).toBeDefined();
      expect(result.groupId).toBe('test-group-2');
      expect(result.userId).toBe(userId);
      expect(result.roundNumber).toBe(1);
    });

    it('should allow different users to contribute to the same round in the same group', async () => {
      const differentUserContribution: CreateContributionDto = {
        groupId,
        userId: 'test-user-2',
        roundNumber: 1,
        transactionHash: 'hash-005',
        amount: 200,
      };

      const result = await service.createContribution(differentUserContribution);

      expect(result).toBeDefined();
      expect(result.userId).toBe('test-user-2');
      expect(result.roundNumber).toBe(1);
      expect(result.groupId).toBe(groupId);
    });
  });

  describe('Query Methods', () => {
    const groupId = 'query-group';
    const userId = 'query-user';

    beforeAll(async () => {
      // Create test data
      await service.createContribution({
        groupId,
        userId,
        roundNumber: 1,
        transactionHash: 'hash-q1',
        amount: 100,
      });

      await service.createContribution({
        groupId,
        userId,
        roundNumber: 2,
        transactionHash: 'hash-q2',
        amount: 150,
      });

      await service.createContribution({
        groupId,
        userId: 'different-user',
        roundNumber: 1,
        transactionHash: 'hash-q3',
        amount: 200,
      });
    });

    it('should find contributions by group and user', async () => {
      const results = await service.findByGroupAndUser(groupId, userId);

      expect(results).toHaveLength(2);
      expect(results.every((c) => c.groupId === groupId && c.userId === userId)).toBe(true);
    });

    it('should find contributions by group and round', async () => {
      const results = await service.findByRound(groupId, 1);

      expect(results).toHaveLength(2); // userId and different-user both contributed in round 1
      expect(results.every((c) => c.groupId === groupId && c.roundNumber === 1)).toBe(true);
    });

    it('should find all contributions', async () => {
      const results = await service.findAll();

      expect(results.length).toBeGreaterThan(0);
    });
  });
});
