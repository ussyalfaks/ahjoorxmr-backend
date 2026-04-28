import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Announcement } from './entities/announcement.entity';
import { Group } from './entities/group.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { MembershipStatus } from '../memberships/entities/membership-status.enum';
import { NotificationsService } from '../notification/notifications.service';
import { NotificationType } from '../notification/notification-type.enum';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
  AnnouncementQueryDto,
} from './dto/announcement.dto';

const GROUP_MAX_ANNOUNCEMENTS = parseInt(
  process.env.GROUP_MAX_ANNOUNCEMENTS ?? '200',
  10,
);

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectRepository(Announcement)
    private readonly announcementRepository: Repository<Announcement>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async requireGroupAdmin(
    groupId: string,
    userId: string,
  ): Promise<Group> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('Group not found');

    const membership = await this.membershipRepository.findOne({
      where: { groupId, userId, status: MembershipStatus.ACTIVE },
    });
    if (!membership || membership.walletAddress !== group.adminWallet) {
      throw new ForbiddenException('Only group admins can perform this action');
    }

    return group;
  }

  async createAnnouncement(
    groupId: string,
    requestingUserId: string,
    dto: CreateAnnouncementDto,
  ): Promise<Announcement> {
    const group = await this.requireGroupAdmin(groupId, requestingUserId);

    // Cap enforcement: soft-delete oldest non-pinned when at limit
    const count = await this.announcementRepository.count({
      where: { groupId, deletedAt: IsNull() },
    });
    if (count >= GROUP_MAX_ANNOUNCEMENTS) {
      const oldest = await this.announcementRepository.findOne({
        where: { groupId, isPinned: false, deletedAt: IsNull() },
        order: { createdAt: 'ASC' },
      });
      if (oldest) {
        await this.announcementRepository.softDelete(oldest.id);
      }
    }

    const announcement = this.announcementRepository.create({
      groupId,
      authorId: requestingUserId,
      title: dto.title,
      body: dto.body,
      isPinned: dto.isPinned ?? false,
    });

    const saved = await this.announcementRepository.save(announcement);

    // Fan-out GROUP_ANNOUNCEMENT notification if requested
    if (dto.notify) {
      const activeMembers = await this.membershipRepository.find({
        where: { groupId, status: MembershipStatus.ACTIVE },
      });

      const notifications = activeMembers
        .filter((m) => m.userId !== requestingUserId)
        .map((m) => ({
          userId: m.userId,
          type: NotificationType.GROUP_ANNOUNCEMENT,
          title: `New announcement: ${dto.title}`,
          body: `${group.name}: ${dto.body.substring(0, 200)}`,
          metadata: { groupId, announcementId: saved.id },
          idempotencyKey: `announcement-${saved.id}-${m.userId}`,
        }));

      if (notifications.length > 0) {
        await this.notificationsService.notifyBatch(notifications);
      }
    }

    return saved;
  }

  async listAnnouncements(
    groupId: string,
    requestingUserId: string,
    query: AnnouncementQueryDto,
  ): Promise<{
    data: Announcement[];
    total: number;
    page: number;
    limit: number;
  }> {
    // Verify requester is an active group member
    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });
    if (!group) throw new NotFoundException('Group not found');

    const membership = await this.membershipRepository.findOne({
      where: { groupId, userId: requestingUserId, status: MembershipStatus.ACTIVE },
    });
    if (!membership) {
      throw new ForbiddenException(
        'Only active group members can view announcements',
      );
    }

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const [data, total] = await this.announcementRepository.findAndCount({
      where: { groupId, deletedAt: IsNull() },
      order: { isPinned: 'DESC', createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async updateAnnouncement(
    groupId: string,
    announcementId: string,
    requestingUserId: string,
    dto: UpdateAnnouncementDto,
  ): Promise<Announcement> {
    await this.requireGroupAdmin(groupId, requestingUserId);

    const announcement = await this.announcementRepository.findOne({
      where: { id: announcementId, groupId, deletedAt: IsNull() },
    });
    if (!announcement) throw new NotFoundException('Announcement not found');

    if (dto.title !== undefined) announcement.title = dto.title;
    if (dto.body !== undefined) announcement.body = dto.body;
    if (dto.isPinned !== undefined) announcement.isPinned = dto.isPinned;

    return this.announcementRepository.save(announcement);
  }

  async deleteAnnouncement(
    groupId: string,
    announcementId: string,
    requestingUserId: string,
  ): Promise<void> {
    await this.requireGroupAdmin(groupId, requestingUserId);

    const announcement = await this.announcementRepository.findOne({
      where: { id: announcementId, groupId, deletedAt: IsNull() },
    });
    if (!announcement) throw new NotFoundException('Announcement not found');

    await this.announcementRepository.softDelete(announcementId);
  }
}
