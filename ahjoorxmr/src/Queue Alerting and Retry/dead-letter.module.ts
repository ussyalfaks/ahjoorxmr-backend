import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DeadLetterService } from './dead-letter.service';
import { QueueController } from './queue.controller';
import { DeadLetterRecord } from './entities/dead-letter-record.entity';
import { NotificationModule } from '../notifications/notification.module';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeadLetterRecord]),
    ConfigModule,
    NotificationModule,
    QueueModule,
  ],
  controllers: [QueueController],
  providers: [DeadLetterService],
  exports: [DeadLetterService],
})
export class DeadLetterModule {}
