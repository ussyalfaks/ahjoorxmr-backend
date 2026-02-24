import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { RedisModule } from '../common/redis/redis.module';
import { RedisThrottlerStorageService } from './redis-throttler-storage.service';
import { throttlerConfig } from './throttler.config';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      ...throttlerConfig,
      storage: RedisThrottlerStorageService,
    }),
    RedisModule,
  ],
  providers: [RedisThrottlerStorageService],
  exports: [ThrottlerModule, RedisThrottlerStorageService],
})
export class CustomThrottlerModule {}
