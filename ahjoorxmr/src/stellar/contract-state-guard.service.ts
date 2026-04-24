import { Injectable, Logger, HttpStatus, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../common/redis/redis.service';
import { StellarService } from './stellar.service';
import {
  ContractException,
  ContractStateConflictException,
  ContractValidationException,
} from './exceptions/contract.exception';

@Injectable()
export class ContractStateGuard {
  private readonly logger = new Logger(ContractStateGuard.name);
  private readonly cacheTtlMs: number;

  constructor(
    @Inject(forwardRef(() => StellarService))
    private readonly stellarService: StellarService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.cacheTtlMs = this.configService.get<number>(
      'CONTRACT_STATE_CACHE_TTL_MS',
      5000,
    );
  }

  /**
   * Validates contract preconditions before transaction submission by simulating the call.
   * Caches the simulation result/state if applicable.
   */
  async validatePreconditions(
    contractAddress: string,
    method: string,
    ...args: any[]
  ): Promise<any> {
    const cacheKey = `contract_state:${contractAddress}:${method}:${JSON.stringify(args)}`;
    
    // Check cache for short-lived state
    const cached = await this.redisService.get<any>(cacheKey);
    if (cached) {
      this.logger.debug(`Using cached state for ${method} on ${contractAddress}`);
      return cached;
    }

    try {
      // Perform simulation via StellarService
      // Note: We need a method in StellarService that returns raw simulation errors
      const result = await (this.stellarService as any).simulateCall(
        contractAddress,
        method,
        ...args,
      );

      // Log simulation result and state snapshot
      this.logger.log(
        JSON.stringify({
          event: 'contract_simulation_success',
          contractAddress,
          method,
          feeEstimate: result.minResourceFee,
          stateSnapshot: result.nativeValue,
        }),
      );

      // Cache the result
      await this.redisService.set(cacheKey, result.nativeValue, this.cacheTtlMs / 1000);
      
      return result.nativeValue;
    } catch (error) {
      // Map Soroban contract error codes to typed exceptions
      const contractError = this.mapSorobanError(error);
      
      this.logger.warn(
        JSON.stringify({
          event: 'contract_simulation_failure',
          contractAddress,
          method,
          error: contractError.getResponse(),
          originalError: error.message,
        }),
      );
      
      throw contractError;
    }
  }

  private mapSorobanError(error: any): ContractException {
    const message = error.message || 'Unknown contract error';
    const loweredMessage = message.toLowerCase();

    // Map common Soroban contract error patterns/codes
    // These codes (1, 2, 3...) are examples and should be replaced with actual contract codes if known.
    // For this task, we map based on common descriptive messages often found in Soroban simulation errors.
    
    if (loweredMessage.includes('round_closed') || loweredMessage.includes('round already finished')) {
      return new ContractStateConflictException('Round is already closed', 101);
    }
    
    if (loweredMessage.includes('already_contributed') || loweredMessage.includes('duplicate contribution')) {
      return new ContractStateConflictException('Member has already contributed to this round', 102);
    }
    
    if (loweredMessage.includes('group_full') || loweredMessage.includes('capacity reached')) {
      return new ContractStateConflictException('Group capacity has been reached', 103);
    }

    if (loweredMessage.includes('invalid_amount') || loweredMessage.includes('amount too low')) {
      return new ContractValidationException('Invalid contribution amount', 201);
    }

    if (loweredMessage.includes('unauthorized') || loweredMessage.includes('not a member')) {
      return new ContractException('Unauthorized contract access', HttpStatus.FORBIDDEN, 401);
    }

    // Default fallback
    return new ContractException(
      `Contract precondition failed: ${message}`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
