import {
  Controller,
  Get,
  Post,
  Query,
  HttpCode,
  HttpStatus,
  Version,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JobFailureService, JobFailureFilter } from './job-failure.service';

@ApiTags('Admin – Job Failures')
@ApiBearerAuth()
@Controller('admin/jobs/failures')
@Version('1')
export class JobFailuresAdminController {
  constructor(private readonly jobFailureService: JobFailureService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get paginated job failures (admin only)' })
  @ApiQuery({ name: 'queueName', required: false })
  @ApiQuery({ name: 'jobName', required: false })
  @ApiQuery({ name: 'from', required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'to', required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Paginated job failures' })
  async getFailures(@Query() query: JobFailureFilter) {
    const { data, total } = await this.jobFailureService.findAll(query);
    return {
      data,
      total,
      page: Number(query.page ?? 1),
      limit: Number(query.limit ?? 20),
    };
  }

  @Post('retry-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry all failed jobs across all queues (admin only)' })
  @ApiResponse({ status: 200, description: 'Number of jobs retried' })
  async retryAll() {
    return this.jobFailureService.retryAll();
  }
}
