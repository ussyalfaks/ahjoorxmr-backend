import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Version,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AnnouncementsService } from './announcements.service';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
  AnnouncementQueryDto,
} from './dto/announcement.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Group Announcements')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('groups')
@Version('1')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  /**
   * Create an announcement (group admin only).
   * Set notify:true to fan-out a GROUP_ANNOUNCEMENT notification to all active members.
   */
  @Post(':id/announcements')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create group announcement (group admin only)' })
  @ApiResponse({ status: 201, description: 'Announcement created' })
  @ApiResponse({ status: 403, description: 'Not group admin' })
  async create(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Body() dto: CreateAnnouncementDto,
    @Request() req: any,
  ) {
    const userId: string =
      req.user?.sub ?? req.user?.userId ?? req.user?.id;
    return this.announcementsService.createAnnouncement(groupId, userId, dto);
  }

  /**
   * List group announcements (active members only).
   * Pinned announcements are always returned first.
   */
  @Get(':id/announcements')
  @ApiOperation({ summary: 'List announcements, pinned first (active members only)' })
  @ApiResponse({ status: 200, description: 'Paginated announcements' })
  @ApiResponse({ status: 403, description: 'Not an active member' })
  async list(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Query() query: AnnouncementQueryDto,
    @Request() req: any,
  ) {
    const userId: string =
      req.user?.sub ?? req.user?.userId ?? req.user?.id;
    return this.announcementsService.listAnnouncements(groupId, userId, query);
  }

  /**
   * Edit an announcement (group admin only).
   */
  @Patch(':id/announcements/:announcementId')
  @ApiOperation({ summary: 'Edit announcement (group admin only)' })
  @ApiResponse({ status: 200, description: 'Announcement updated' })
  @ApiResponse({ status: 403, description: 'Not group admin' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  async update(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Param('announcementId', ParseUUIDPipe) announcementId: string,
    @Body() dto: UpdateAnnouncementDto,
    @Request() req: any,
  ) {
    const userId: string =
      req.user?.sub ?? req.user?.userId ?? req.user?.id;
    return this.announcementsService.updateAnnouncement(
      groupId,
      announcementId,
      userId,
      dto,
    );
  }

  /**
   * Soft-delete an announcement (group admin only).
   */
  @Delete(':id/announcements/:announcementId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete announcement (group admin only, soft-delete)' })
  @ApiResponse({ status: 204, description: 'Announcement deleted' })
  @ApiResponse({ status: 403, description: 'Not group admin' })
  @ApiResponse({ status: 404, description: 'Announcement not found' })
  async delete(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Param('announcementId', ParseUUIDPipe) announcementId: string,
    @Request() req: any,
  ): Promise<void> {
    const userId: string =
      req.user?.sub ?? req.user?.userId ?? req.user?.id;
    return this.announcementsService.deleteAnnouncement(
      groupId,
      announcementId,
      userId,
    );
  }
}
