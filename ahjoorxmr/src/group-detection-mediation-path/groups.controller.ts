import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import { ReactivateGroupDto } from './dto/reactivate-group.dto';
import { ListGroupsDto } from './dto/list-groups.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';

@ApiTags('Groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @ApiOperation({
    summary: 'List all groups',
    description:
      'Returns a paginated list of groups. Supports filtering by status (ACTIVE, STALE, ARCHIVED).',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated group list including staleAt timestamps',
  })
  list(@Query() dto: ListGroupsDto) {
    return this.groupsService.list(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get group by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Group found' })
  @ApiResponse({ status: 404, description: 'Group not found' })
  findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.groupsService.findById(id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Reactivate a stale group (Admin only)',
    description:
      'Clears the staleAt timestamp, resets group status to ACTIVE, and notifies the group admin. Requires a reason string.',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Group reactivated successfully' })
  @ApiResponse({ status: 404, description: 'Group not found' })
  @ApiResponse({ status: 409, description: 'Group is not in STALE status' })
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReactivateGroupDto,
    @Request() req: { user: { id: string } },
  ) {
    return this.groupsService.reactivate(id, req.user.id, dto.reason);
  }
}
