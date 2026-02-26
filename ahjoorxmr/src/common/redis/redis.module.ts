import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * RedisModule - Global module for Redis operations
 * Provides RedisService for caching and authentication challenge storage
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
