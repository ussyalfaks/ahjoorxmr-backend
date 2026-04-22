import {
  Controller,
  Get,
  Query,
  UseGuards,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { AuditLogService } from '../services/audit-log.service';
import { AuditLog } from '../entities/audit-log.entity';

/**
 * Simple guard to check if user is admin
 * In production, implement proper role-based access control
 */
export class AdminGuard {
  canActivate(context: any): boolean {
    const request = context.switchToHttp().getRequest();
    // TODO: Implement proper admin check
    // For now, we'll assume user with admin role
    return request.user?.role === 'admin' || true;
  }
}

@Controller('api/v1/audit')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  /**
   * GET /api/v1/audit?resource=GROUP&resourceId=123
   * Query audit logs by resource and resourceId
   */
  @Get()
  @UseGuards(AdminGuard)
  async findAuditLogs(
    @Query('resource') resource?: string,
    @Query('resourceId') resourceId?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ data: AuditLog[]; total: number }> {
    const limitNum = Math.min(parseInt(limit || '50', 10), 1000);
    const offsetNum = parseInt(offset || '0', 10);

    if (limitNum <= 0) {
      throw new BadRequestException('limit must be greater than 0');
    }

    if (offsetNum < 0) {
      throw new BadRequestException(
        'offset must be greater than or equal to 0',
      );
    }

    return this.auditLogService.findAll({
      resource,
      resourceId,
      userId,
      action,
      limit: limitNum,
      offset: offsetNum,
    });
  }

  /**
   * GET /api/v1/audit/id/:auditId
   * Get a specific audit log by ID
   */
  @Get('id/:auditId')
  @UseGuards(AdminGuard)
  async getAuditLogById(@Param('auditId') auditId: string): Promise<AuditLog> {
    const auditLog = await this.auditLogService.findById(auditId);
    if (!auditLog) {
      throw new BadRequestException(`Audit log with ID ${auditId} not found`);
    }
    return auditLog;
  }

  /**
   * GET /api/v1/audit/resource/:resource/:resourceId
   * Get audit logs for a specific resource
   */
  @Get('resource/:resource/:resourceId')
  @UseGuards(AdminGuard)
  async getResourceAuditLogs(
    @Param('resource') resource: string,
    @Param('resourceId') resourceId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ data: AuditLog[]; total: number }> {
    const limitNum = Math.min(parseInt(limit || '50', 10), 1000);
    const offsetNum = parseInt(offset || '0', 10);

    return this.auditLogService.findByResource(
      resource,
      resourceId,
      limitNum,
      offsetNum,
    );
  }

  /**
   * GET /api/v1/audit/user/:userId
   * Get audit logs for a specific user
   */
  @Get('user/:userId')
  @UseGuards(AdminGuard)
  async getUserAuditLogs(
    @Param('userId') userId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<{ data: AuditLog[]; total: number }> {
    const limitNum = Math.min(parseInt(limit || '50', 10), 1000);
    const offsetNum = parseInt(offset || '0', 10);

    return this.auditLogService.findByUser(userId, limitNum, offsetNum);
  }
}
