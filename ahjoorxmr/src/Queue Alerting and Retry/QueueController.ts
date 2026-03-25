import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  UseGuards,
  HttpCode,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DeadLetterService } from './dead-letter.service';
import { RoleGuard } from '../auth/guards/role.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Queue Management')
@Controller('api/v1/queue')
@ApiBearerAuth()
@UseGuards(RoleGuard)
export class QueueController {
  constructor(private deadLetterService: DeadLetterService) {}

  /**
   * GET /api/v1/queue/dead-letter
   * Retrieve dead letter records with pagination
   * Admin-only endpoint
   */
  @Get('dead-letter')
  @Roles('admin')
  @ApiOperation({
    summary: 'Get dead letter queue records',
    description:
      'Retrieve failed job records from the dead letter queue with pagination. Admin-only.',
  })
  async getDeadLetters(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    let pageNum = parseInt(page, 10);
    let limitNum = parseInt(limit, 10);

    // Validate pagination parameters
    if (isNaN(pageNum) || pageNum < 1) {
      throw new BadRequestException('Page must be a positive integer');
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    const result = await this.deadLetterService.getDeadLetters(
      pageNum,
      limitNum,
    );

    return {
      success: true,
      data: {
        records: result.records,
        pagination: {
          page: result.page,
          limit: limitNum,
          total: result.total,
          pages: Math.ceil(result.total / limitNum),
        },
      },
    };
  }

  /**
   * GET /api/v1/queue/dead-letter/:groupId
   * Retrieve dead letter records for a specific group
   */
  @Get('dead-letter/:groupId')
  @Roles('admin')
  @ApiOperation({
    summary: 'Get dead letter records by group',
    description: 'Retrieve failed job records for a specific queue group.',
  })
  async getDeadLettersByGroup(
    @Param('groupId') groupId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    let pageNum = parseInt(page, 10);
    let limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || pageNum < 1) {
      throw new BadRequestException('Page must be a positive integer');
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Limit must be between 1 and 100');
    }

    const result = await this.deadLetterService.getDeadLettersByGroup(
      groupId,
      pageNum,
      limitNum,
    );

    return {
      success: true,
      data: {
        groupId,
        records: result.records,
        pagination: {
          page: result.page,
          limit: limitNum,
          total: result.total,
          pages: Math.ceil(result.total / limitNum),
        },
      },
    };
  }

  /**
   * PATCH /api/v1/queue/dead-letter/:id/resolve
   * Mark a dead letter record as resolved
   */
  @Patch('dead-letter/:id/resolve')
  @Roles('admin')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Resolve a dead letter record',
    description: 'Mark a failed job as resolved and remove from active queue.',
  })
  async resolveDeadLetter(
    @Param('id') id: string,
    @Query('notes') notes: string = '',
  ) {
    try {
      const record = await this.deadLetterService.resolveDeadLetter(id);

      return {
        success: true,
        message: 'Dead letter record resolved',
        data: record,
      };
    } catch (error) {
      throw new NotFoundException(error.message);
    }
  }

  /**
   * GET /api/v1/queue/dead-letter/:groupId/consecutive-failures
   * Get the current consecutive failure count for a group
   */
  @Get('dead-letter/:groupId/consecutive-failures')
  @Roles('admin')
  @ApiOperation({
    summary: 'Get consecutive failure count',
    description:
      'Retrieve the number of consecutive failures for a queue group.',
  })
  async getConsecutiveFailureCount(@Param('groupId') groupId: string) {
    const count = this.deadLetterService.getConsecutiveFailureCount(groupId);

    return {
      success: true,
      data: {
        groupId,
        consecutiveFailures: count,
      },
    };
  }

  /**
   * POST /api/v1/queue/dead-letter/:groupId/reset-failures
   * Reset the consecutive failure counter for a group
   */
  @Post('dead-letter/:groupId/reset-failures')
  @Roles('admin')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reset failure counter',
    description:
      'Reset the consecutive failure counter for a queue group (useful after manual intervention).',
  })
  async resetConsecutiveFailures(@Param('groupId') groupId: string) {
    this.deadLetterService.resetConsecutiveFailures(groupId);

    return {
      success: true,
      message: `Consecutive failure counter reset for group ${groupId}`,
      data: {
        groupId,
        consecutiveFailures: 0,
      },
    };
  }
}
