import { Injectable } from '@nestjs/common';
import {
  HealthResponseDto,
  ReadinessResponseDto,
} from './dto/health-response.dto';

@Injectable()
export class HealthService {
  getHealthStatus(): HealthResponseDto {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '0.0.1',
    };
  }

  getReadinessStatus(): ReadinessResponseDto {
    // Add any readiness checks here (database connections, external services, etc.)
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'ok', // Placeholder for actual database check
        memory: this.getMemoryUsage(),
      },
    };
  }

  private getMemoryUsage() {
    const memUsage = process.memoryUsage();
    return {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)} MB`,
    };
  }
}
