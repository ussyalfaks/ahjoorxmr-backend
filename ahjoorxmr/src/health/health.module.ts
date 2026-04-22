import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { DatabaseHealthService } from './database-health.service';
import { StellarHealthIndicator } from './stellar-health.indicator';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [HealthService, DatabaseHealthService, StellarHealthIndicator],
  exports: [DatabaseHealthService, StellarHealthIndicator],
})
export class HealthModule {}
