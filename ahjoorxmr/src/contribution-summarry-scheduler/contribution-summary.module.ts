import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';

import { contributionSummaryConfig } from './config/contribution-summary.config';
import { Group, GroupMember } from './entities/group.entity';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications/notifications.service';
import { ContributionSummaryService } from './contribution-summary.service';

@Module({
  imports: [
    // Makes the typed config injectable via contributionSummaryConfig.KEY
    ConfigModule.forFeature(contributionSummaryConfig),

    // Provides SchedulerRegistry + CronJob support
    ScheduleModule.forRoot(),

    TypeOrmModule.forFeature([Group, GroupMember, Notification]),
  ],
  providers: [ContributionSummaryService, NotificationsService],
  exports: [ContributionSummaryService],
})
export class ContributionSummaryModule {}
