import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import { ContractStateGuard } from './contract-state-guard.service';
import { StellarService } from './stellar.service';
import { RedisService } from '../common/redis/redis.service';
import {
  ContractStateConflictException,
  ContractValidationException,
  ContractException,
} from './exceptions/contract.exception';

describe('ContractStateGuard', () => {
  let guard: ContractStateGuard;
  let stellarService: jest.Mocked<StellarService>;
  let redisService: jest.Mocked<RedisService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractStateGuard,
        {
          provide: StellarService,
          useValue: {
            simulateCall: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key, def) => def),
          },
        },
      ],
    }).compile();

    guard = module.get<ContractStateGuard>(ContractStateGuard);
    stellarService = module.get(StellarService);
    redisService = module.get(RedisService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('validatePreconditions', () => {
    const contractAddress = 'CCONTRACT123';
    const method = 'contribute';
    const args = ['GUSER123', 100];

    it('should use cached value if available', async () => {
      redisService.get.mockResolvedValue({ status: 'ACTIVE' });

      const result = await guard.validatePreconditions(contractAddress, method, ...args);

      expect(result).toEqual({ status: 'ACTIVE' });
      expect(stellarService.simulateCall).not.toHaveBeenCalled();
    });

    it('should call simulateCall if no cached value', async () => {
      redisService.get.mockResolvedValue(null);
      stellarService.simulateCall.mockResolvedValue({
        nativeValue: { current_round: 1 },
        minResourceFee: '100',
        attempts: 1,
        simulationLatencyMs: 0,
      });

      const result = await guard.validatePreconditions(contractAddress, method, ...args);

      expect(result).toEqual({ current_round: 1 });
      expect(stellarService.simulateCall).toHaveBeenCalled();
      expect(redisService.set).toHaveBeenCalled();
    });

    it('should throw ContractStateConflictException when round is closed', async () => {
      redisService.get.mockResolvedValue(null);
      stellarService.simulateCall.mockRejectedValue(new Error('round_closed'));

      await expect(guard.validatePreconditions(contractAddress, method, ...args))
        .rejects.toThrow(ContractStateConflictException);
    });

    it('should throw ContractStateConflictException when member already contributed', async () => {
      redisService.get.mockResolvedValue(null);
      stellarService.simulateCall.mockRejectedValue(new Error('already_contributed'));

      await expect(guard.validatePreconditions(contractAddress, method, ...args))
        .rejects.toThrow(ContractStateConflictException);
    });

    it('should throw ContractValidationException for invalid amount', async () => {
      redisService.get.mockResolvedValue(null);
      stellarService.simulateCall.mockRejectedValue(new Error('invalid_amount'));

      await expect(guard.validatePreconditions(contractAddress, method, ...args))
        .rejects.toThrow(ContractValidationException);
    });

    it('should throw generic ContractException for unknown errors', async () => {
      redisService.get.mockResolvedValue(null);
      stellarService.simulateCall.mockRejectedValue(new Error('random error'));

      await expect(guard.validatePreconditions(contractAddress, method, ...args))
        .rejects.toThrow(ContractException);
    });
  });
});
