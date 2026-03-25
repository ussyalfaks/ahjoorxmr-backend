import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { DeadLetterService } from './dead-letter.service';
import { AuthGuard } from '@nestjs/passport';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { User } from '../users/entities/user.entity';

@Controller('api/v1/queue/dead-letter')
@UseGuards(AuthGuard('jwt'), RoleGuard)
export class DeadLetterController {
  constructor(private deadLetterService: DeadLetterService) {}

  /**
   * GET /api/v1/queue/dead-letter
   * Returns the last 50 dead-letter records with pagination (admin-only)
   */
  @Get()
  @Roles('admin')
  async getDeadLetters(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const result = await this.deadLetterService.getDeadLetters(
      pageNum,
      limitNum,
    );

    return {
      success: true,
      data: result.records,
      pagination: {
        page: result.page,
        limit: limitNum,
        total: result.total,
        totalPages: Math.ceil(result.total / limitNum),
      },
    };
  }

  /**
   * GET /api/v1/queue/dead-letter/group/:groupId
   * Returns dead-letter records for a specific group with pagination
   */
  @Get('group/:groupId')
  @Roles('admin')
  async getDeadLettersByGroup(
    @Param('groupId') groupId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const result = await this.deadLetterService.getDeadLettersByGroup(
      groupId,
      pageNum,
      limitNum,
    );

    return {
      success: true,
      data: result.records,
      pagination: {
        page: result.page,
        limit: limitNum,
        total: result.total,
        totalPages: Math.ceil(result.total / limitNum),
        groupId,
      },
    };
  }

  /**
   * GET /api/v1/queue/dead-letter/status/:groupId
   * Get circuit breaker status for a specific group
   */
  @Get('status/:groupId')
  @Roles('admin')
  async getGroupStatus(@Param('groupId') groupId: string) {
    const status = await this.deadLetterService.getGroupStatus(groupId);
    return {
      success: true,
      data: status,
    };
  }

  /**
   * POST /api/v1/queue/dead-letter/:recordId/resolve
   * Mark a dead letter record as resolved
   */
  @Post(':recordId/resolve')
  @Roles('admin')
  @HttpCode(200)
  async resolveDeadLetter(
    @Param('recordId') recordId: string,
    @Body() body: { notes?: string },
    @GetUser() user: User,
  ) {
    await this.deadLetterService.resolveDeadLetter(recordId, body.notes);

    return {
      success: true,
      message: `Dead letter record ${recordId} marked as resolved by ${user.email}`,
    };
  }

  /**
   * POST /api/v1/queue/dead-letter/group/:groupId/resume
   * Resume a paused queue for a specific group
   */
  @Post('group/:groupId/resume')
  @Roles('admin')
  @HttpCode(200)
  async resumeQueue(@Param('groupId') groupId: string) {
    await this.deadLetterService.resumeQueue(groupId);

    return {
      success: true,
      message: `Queue for group "${groupId}" has been resumed.`,
    };
  }

  /**
   * GET /api/v1/queue/dead-letter/export
   * Export dead letter records as CSV (admin-only)
   */
  @Get('export')
  @Roles('admin')
  async exportDeadLetters(@Res() res: Response) {
    const { records } = await this.deadLetterService.getDeadLetters(1, 10000);

    const csv = this.generateCsv(records);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=dead-letters.csv',
    );
    res.send(csv);
  }

  /**
   * Generate CSV from dead letter records
   */
  private generateCsv(records: any[]): string {
    const headers = [
      'ID',
      'Job ID',
      'Group ID',
      'Job Type',
      'Status',
      'Attempt Count',
      'Error',
      'Recorded At',
      'Resolved At',
    ];

    const rows = records.map((r) => [
      r.id,
      r.jobId,
      r.groupId,
      r.jobType,
      r.status,
      r.attemptCount,
      `"${r.error.replace(/"/g, '""')}"`,
      r.recordedAt?.toISOString() || '',
      r.resolvedAt?.toISOString() || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.join(',')),
    ].join('\n');

    return csvContent;
  }
}
