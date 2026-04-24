import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { StellarService } from './stellar.service';
import { ContractStateGuard } from './contract-state-guard.service';
import { RedisService } from '../common/redis/redis.service';
import { WinstonLogger } from '../common/logger/winston.logger';
import { ContractStateConflictException } from './exceptions/contract.exception';

const mockServer = {
  prepareTransaction: jest.fn(),
  simulateTransaction: jest.fn(),
  sendTransaction: jest.fn(),
};

jest.mock('@stellar/stellar-sdk/rpc', () => ({
  Server: jest.fn(() => mockServer),
}));

describe('ContractStateGuard Integration (with StellarService)', () => {
  let stellarService: StellarService;
  let guard: ContractStateGuard;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const values: Record<string, any> = {
        STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
        STELLAR_NETWORK: 'testnet',
        STELLAR_NETWORK_PASSPHRASE: (StellarSdk as any).Networks.TESTNET,
        CONTRACT_ADDRESS: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
        CONTRACT_STATE_CACHE_TTL_MS: 5000,
      };
      return values[key] ?? defaultValue;
    }),
  };

  const mockLogger: Partial<WinstonLogger> = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockRedisService = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        ContractStateGuard,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: WinstonLogger, useValue: mockLogger },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    stellarService = module.get<StellarService>(StellarService);
    guard = module.get<ContractStateGuard>(ContractStateGuard);
  });

  it('should prevent disbursePayout when round is already closed', async () => {
    const contractAddress = 'CA5QXBQRF5VCLLS2TTQEBX6UNPVPDEBMJ7PPGX6V7TMZBXA4HL6GUMM7';
    const recipient = 'GA5QXBQRF5VCLLS2TTQEBX6UNPVPDEBMJ7PPGX6V7TMZBXA4HL6GVIJG';
    const amount = '100';

    // Mock Redis: Cache miss
    mockRedisService.get.mockResolvedValue(null);

    // Mock Soroban simulation error for the precondition check
    mockServer.prepareTransaction.mockResolvedValue({ fee: '100', addOperation: jest.fn() });
    mockServer.simulateTransaction.mockResolvedValue({
      id: 'SimulateTransactionError',
      error: 'Error(Contract, #101)', // Typical Soroban contract error string or similar
    });
    
    // Custom error string for the guard mapping
    // Our guard currently checks for specific substrings
    mockServer.simulateTransaction.mockResolvedValue({
      id: 'SimulateTransactionError',
      error: 'Contract error: round_closed',
    });

    await expect(stellarService.disbursePayout(contractAddress, recipient, amount))
      .rejects.toThrow(ContractStateConflictException);
    
    // Verify guard was called (via simulation call)
    expect(mockServer.simulateTransaction).toHaveBeenCalled();
    // Verify sendTransaction was NOT called
    expect(mockServer.sendTransaction).not.toHaveBeenCalled();
  });

  it('should allow disbursePayout when simulation succeeds', async () => {
    const contractAddress = 'CA5QXBQRF5VCLLS2TTQEBX6UNPVPDEBMJ7PPGX6V7TMZBXA4HL6GUMM7';
    const recipient = 'GA5QXBQRF5VCLLS2TTQEBX6UNPVPDEBMJ7PPGX6V7TMZBXA4HL6GVIJG';
    const amount = '100';

    mockRedisService.get.mockResolvedValue(null);
    mockServer.prepareTransaction.mockResolvedValue({ 
        fee: '100', 
        hash: () => Buffer.from('mock-hash'),
        id: 'mock-id'
    });
    
    // Simulation for validation succeeds
    mockServer.simulateTransaction.mockResolvedValue({
      result: { retval: { status: 'ACTIVE' } },
    });

    // Mock sendTransaction success
    mockServer.sendTransaction.mockResolvedValue({
      hash: 'final-tx-hash',
    });

    const result = await stellarService.disbursePayout(contractAddress, recipient, amount);

    expect(result).toBe('final-tx-hash');
    expect(mockServer.simulateTransaction).toHaveBeenCalled();
    expect(mockServer.sendTransaction).toHaveBeenCalled();
  });
});
