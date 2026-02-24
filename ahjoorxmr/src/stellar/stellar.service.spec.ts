import { Test, TestingModule } from '@nestjs/testing';
import {
  BadGatewayException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import * as SorobanRpc from '@stellar/stellar-sdk/rpc';
import { StellarService } from './stellar.service';

const mockServer = {
  prepareTransaction: jest.fn(),
  simulateTransaction: jest.fn(),
  getTransaction: jest.fn(),
};

jest.mock('@stellar/stellar-sdk/rpc', () => ({
  Server: jest.fn(() => mockServer),
}));

describe('StellarService', () => {
  let service: StellarService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      const values: Record<string, string> = {
        STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
        STELLAR_NETWORK: 'testnet',
        STELLAR_NETWORK_PASSPHRASE: (StellarSdk as any).Networks.TESTNET,
        CONTRACT_ADDRESS: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      };
      return values[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockServer.prepareTransaction.mockResolvedValue({ prepared: true });
    mockServer.simulateTransaction.mockResolvedValue({
      result: { retval: { id: 'group-1' } },
    });
    mockServer.getTransaction.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<StellarService>(StellarService);
  });

  it('should create Soroban RPC server from env config', () => {
    expect((SorobanRpc as any).Server).toHaveBeenCalledWith(
      'https://soroban-testnet.stellar.org',
      { allowHttp: false },
    );
  });

  describe('getGroupState()', () => {
    it('calls get_state and returns parsed result', async () => {
      const result = await service.getGroupState(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      );

      expect(mockServer.simulateTransaction).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ id: 'group-1' });
    });

    it('maps RPC network failures to BadGatewayException', async () => {
      mockServer.simulateTransaction.mockRejectedValue(
        new Error('Network timeout while calling RPC'),
      );

      await expect(
        service.getGroupState(
          'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
        ),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('getGroupInfo()', () => {
    it('calls get_group_info and returns parsed result', async () => {
      mockServer.simulateTransaction.mockResolvedValue({
        result: { retval: { name: 'test-group', size: 5 } },
      });

      const result = await service.getGroupInfo(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      );

      expect(result).toEqual({ name: 'test-group', size: 5 });
    });
  });

  describe('verifyContribution()', () => {
    it('throws BadRequestException when tx hash is empty', async () => {
      await expect(service.verifyContribution('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns true for valid contribute transaction', async () => {
      mockServer.getTransaction.mockResolvedValue({
        status: 'SUCCESS',
        functionName: 'contribute',
        contractAddress:
          'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      });

      await expect(service.verifyContribution('tx-123')).resolves.toBe(true);
    });

    it('returns false for non-success transactions', async () => {
      mockServer.getTransaction.mockResolvedValue({
        status: 'FAILED',
      });

      await expect(service.verifyContribution('tx-123')).resolves.toBe(false);
    });
  });

  describe('verifySignature()', () => {
    it('returns true when Stellar signature is valid', () => {
      const keypair = (StellarSdk as any).Keypair.random();
      const message = 'Sign In With Stellar';
      const signature = keypair.sign(Buffer.from(message)).toString('base64');

      expect(service.verifySignature(keypair.publicKey(), message, signature)).toBe(
        true,
      );
    });

    it('returns false for malformed signature payload', () => {
      const keypair = (StellarSdk as any).Keypair.random();
      const message = 'Sign In With Stellar';

      expect(service.verifySignature(keypair.publicKey(), message, 'not-base64!')).toBe(
        false,
      );
    });
  });

  describe('configuration handling', () => {
    it('throws InternalServerErrorException when CONTRACT_ADDRESS is missing', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'CONTRACT_ADDRESS') {
          return '';
        }
        const values: Record<string, string> = {
          STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
          STELLAR_NETWORK: 'testnet',
          STELLAR_NETWORK_PASSPHRASE: (StellarSdk as any).Networks.TESTNET,
        };
        return values[key] ?? defaultValue;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StellarService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const configuredService = module.get<StellarService>(StellarService);
      await expect(
        configuredService.getGroupState(
          'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
        ),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
