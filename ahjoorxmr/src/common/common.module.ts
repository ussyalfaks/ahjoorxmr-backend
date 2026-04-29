import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlowRequestLogService } from './services/slow-request-log.service';
import { SlowRequestsAdminController } from './controllers/slow-requests-admin.controller';
import { DeprecationUsageController } from './controllers/deprecation-usage.controller';
import { DeprecationUsageService } from './services/deprecation-usage.service';
import { MaintenanceModeService } from './services/maintenance-mode.service';
import { MaintenanceModeGuard } from './guards/maintenance-mode.guard';
import { GroupMaintenanceMixin } from './services/group-maintenance.mixin';
import { AuditLog } from '../audit/entities/audit-log.entity';

/**
 * Common module for shared services and controllers
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [SlowRequestsAdminController, DeprecationUsageController],
  providers: [
    SlowRequestLogService,
    DeprecationUsageService,
    MaintenanceModeService,
    MaintenanceModeGuard,
    GroupMaintenanceMixin,
  ],
  exports: [SlowRequestLogService, DeprecationUsageService, MaintenanceModeService, GroupMaintenanceMixin],
})
export class CommonModule {}
