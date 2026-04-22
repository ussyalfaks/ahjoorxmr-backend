import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { HealthService } from './health.service';
import { StellarHealthIndicator } from './stellar-health.indicator';
import {
  HealthResponseDto,
  ReadinessResponseDto,
} from './dto/health-response.dto';
import { InternalServerErrorResponseDto } from '../common/dto/error-response.dto';

/**
 * Health check endpoints use a lenient throttle (300 req/min) so monitoring
 * tools are never locked out by the global per-user rate limit.
 */
@ApiTags('Health')
@Controller('health')
@Throttle({ default: { limit: 300, ttl: 60000 } })
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly health: HealthCheckService,
    private readonly stellarHealth: StellarHealthIndicator,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Get application health status',
    description:
      'Returns the current health status of the application including uptime and environment information',
  })
  @ApiResponse({
    status: 200,
    description: 'Health status retrieved successfully',
    type: HealthResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  async getHealth(): Promise<HealthResponseDto> {
    return this.healthService.getHealthStatus();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Get application readiness status',
    description:
      'Returns the readiness status including system checks like database connectivity and memory usage',
  })
  @ApiResponse({
    status: 200,
    description: 'Readiness status retrieved successfully',
    type: ReadinessResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  async getReadiness(): Promise<ReadinessResponseDto> {
    return this.healthService.getReadinessStatus();
  }

  @Get('database')
  @ApiOperation({
    summary: 'Get database health status',
    description:
      'Returns detailed database health information including connection pool stats and database size',
  })
  @ApiResponse({
    status: 200,
    description: 'Database health status retrieved successfully',
  })
  async getDatabaseHealth() {
    return this.healthService.getDatabaseHealth();
  }

  @Get('stellar')
  @HealthCheck()
  @ApiOperation({
    summary: 'Get Stellar network health status',
    description: 'Pings Horizon API and Soroban RPC to verify Stellar connectivity',
  })
  @ApiResponse({ status: 200, description: 'Stellar network is healthy' })
  @ApiResponse({ status: 503, description: 'Stellar network is unhealthy' })
  async getStellarHealth() {
    return this.health.check([() => this.stellarHealth.isHealthy('stellar')]);
  }
}
