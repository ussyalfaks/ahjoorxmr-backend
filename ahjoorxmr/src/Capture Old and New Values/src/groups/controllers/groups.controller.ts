import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseInterceptors,
} from '@nestjs/common';
import { GroupsService } from '../services/groups.service';
import { CreateGroupDto, UpdateGroupDto } from '../dto/group.dto';
import { AuditLogDecorator } from '../../audit/decorators/audit-log.decorator';
import { AuditLoggingInterceptor } from '../../audit/interceptors/audit-logging.interceptor';
import { Group } from '../entities/group.entity';

@Controller('api/v1/groups')
@UseInterceptors(AuditLoggingInterceptor)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  /**
   * Create a new group
   * Audit: Logs the created group data as newValue
   */
  @Post()
  @AuditLogDecorator({
    action: 'CREATE',
    resource: 'GROUP',
    excludeFields: ['password', 'refreshTokenHash'],
  })
  async create(@Body() createGroupDto: CreateGroupDto): Promise<Group> {
    return this.groupsService.create(createGroupDto);
  }

  /**
   * Get all groups
   * Note: Not audited (read-only operation, no mutating action)
   */
  @Get()
  async findAll(): Promise<Group[]> {
    return this.groupsService.findAll();
  }

  /**
   * Get a specific group by ID
   * Note: Not audited (read-only operation, no mutating action)
   */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Group> {
    return this.groupsService.findOne(id);
  }

  /**
   * Update a group
   * Audit: Logs the updated data as newValue
   */
  @Patch(':id')
  @AuditLogDecorator({
    action: 'UPDATE',
    resource: 'GROUP',
    excludeFields: ['password', 'refreshTokenHash'],
  })
  async update(
    @Param('id') id: string,
    @Body() updateGroupDto: UpdateGroupDto,
  ): Promise<Group> {
    return this.groupsService.update(id, updateGroupDto);
  }

  /**
   * Delete a group
   * Audit: Logs the deletion action
   */
  @Delete(':id')
  @AuditLogDecorator({
    action: 'DELETE',
    resource: 'GROUP',
  })
  async remove(@Param('id') id: string): Promise<void> {
    return this.groupsService.remove(id);
  }
}
