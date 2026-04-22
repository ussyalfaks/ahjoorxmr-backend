import { Module } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { StellarCircuitBreakerService } from './stellar-circuit-breaker.service';
import { WinstonLogger } from '../common/logger/winston.logger';

@Module({
  providers: [StellarService, StellarCircuitBreakerService, WinstonLogger],
  exports: [StellarService, StellarCircuitBreakerService],
})
export class StellarModule {}
