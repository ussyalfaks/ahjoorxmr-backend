import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SchedulerService } from './scheduler.service';
import { AuditLogService } from './services/audit-log.service';
import { ContributionSummaryService } from './services/contribution-summary.service';
import { GroupStatusService } from './services/group-status.service';
import { DistributedLockService } from './services/distributed-lock.service';
import { AuditLog } from './entities/audit-log.entity';
import { Contribution } from '../contributions/entities/contribution.entity';
import { Group } from '../groups/entities/group.entity';
import { Membership } from '../memberships/entities/membership.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([AuditLog, Contribution, Group, Membership]),
  ],
  providers: [
    SchedulerService,
    AuditLogService,
    ContributionSummaryService,
    GroupStatusService,
    DistributedLockService,
  ],
  exports: [AuditLogService],
})
export class SchedulerModule {}
