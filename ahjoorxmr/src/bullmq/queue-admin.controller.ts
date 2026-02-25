import {
  Controller,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
  Version,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { QueueService, AllQueueStats } from './queue.service';

// ---------------------------------------------------------------------------
// Replace these with your actual guards / decorators
// ---------------------------------------------------------------------------
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
// import { RolesGuard } from '../auth/guards/roles.guard';
// import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Admin – Queue')
@ApiBearerAuth()
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Roles('admin')
@Controller('admin/queue')
@Version('1')
export class QueueAdminController {
  constructor(private readonly queueService: QueueService) {}

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get queue depths and failed-job counts (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Queue statistics for all queues including the dead-letter queue',
  })
  async getStats(): Promise<AllQueueStats> {
    return this.queueService.getStats();
  }
}
