import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnnouncementsService } from '../announcements.service';
import { Announcement } from '../entities/announcement.entity';
import { Group } from '../entities/group.entity';
import { Membership } from '../../memberships/entities/membership.entity';
import { MembershipStatus } from '../../memberships/entities/membership-status.enum';
import { NotificationsService } from '../../notification/notifications.service';
import { NotificationType } from '../../notification/notification-type.enum';

jest.mock('../../notification/notifications.service', () => ({
  NotificationsService: class NotificationsService {},
}));

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let announcementRepository: Repository<Announcement>;
  let groupRepository: Repository<Group>;
  let membershipRepository: Repository<Membership>;
  let notificationsService: NotificationsService;

  const mockAnnouncementRepository = {
    create: jest.fn((value) => value),
    count: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    softDelete: jest.fn(),
    findAndCount: jest.fn(),
  };

  const mockGroupRepository = {
    findOne: jest.fn(),
  };

  const mockMembershipRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockNotificationsService = {
    notifyBatch: jest.fn().mockResolvedValue([]),
  };

  const group = {
    id: 'group-1',
    name: 'Weekly Circle',
    adminWallet: 'GADMIN',
  } as Group;

  const adminMembership = {
    groupId: 'group-1',
    userId: 'admin-1',
    walletAddress: 'GADMIN',
    status: MembershipStatus.ACTIVE,
  } as Membership;

  const memberMembership = {
    groupId: 'group-1',
    userId: 'member-1',
    walletAddress: 'GMEMBER',
    status: MembershipStatus.ACTIVE,
  } as Membership;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        {
          provide: getRepositoryToken(Announcement),
          useValue: mockAnnouncementRepository,
        },
        {
          provide: getRepositoryToken(Group),
          useValue: mockGroupRepository,
        },
        {
          provide: getRepositoryToken(Membership),
          useValue: mockMembershipRepository,
        },
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
      ],
    }).compile();

    service = module.get<AnnouncementsService>(AnnouncementsService);
    announcementRepository = module.get<Repository<Announcement>>(
      getRepositoryToken(Announcement),
    );
    groupRepository = module.get<Repository<Group>>(getRepositoryToken(Group));
    membershipRepository = module.get<Repository<Membership>>(
      getRepositoryToken(Membership),
    );
    notificationsService = module.get<NotificationsService>(NotificationsService);

    jest.clearAllMocks();
  });

  it('blocks announcement creation for non-admin members', async () => {
    jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
    jest.spyOn(membershipRepository, 'findOne').mockResolvedValue(memberMembership);

    await expect(
      service.createAnnouncement('group-1', 'member-1', {
        title: 'Heads up',
        body: 'Round closes tomorrow',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('fans out GROUP_ANNOUNCEMENT notifications to active members when notify=true', async () => {
    jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
    jest.spyOn(membershipRepository, 'findOne').mockResolvedValue(adminMembership);
    jest.spyOn(announcementRepository, 'count').mockResolvedValue(3);
    jest
      .spyOn(announcementRepository, 'save')
      .mockResolvedValue({
        id: 'announcement-1',
        groupId: 'group-1',
        authorId: 'admin-1',
        title: 'New schedule',
        body: 'Payout date moved by one day',
        isPinned: false,
      } as Announcement);
    jest.spyOn(membershipRepository, 'find').mockResolvedValue([
      adminMembership,
      memberMembership,
      {
        groupId: 'group-1',
        userId: 'member-2',
        walletAddress: 'GMEMBER2',
        status: MembershipStatus.ACTIVE,
      } as Membership,
    ]);

    await service.createAnnouncement('group-1', 'admin-1', {
      title: 'New schedule',
      body: 'Payout date moved by one day',
      notify: true,
    });

    expect(notificationsService.notifyBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: 'member-1',
        type: NotificationType.GROUP_ANNOUNCEMENT,
        idempotencyKey: 'announcement-announcement-1-member-1',
      }),
      expect.objectContaining({
        userId: 'member-2',
        type: NotificationType.GROUP_ANNOUNCEMENT,
        idempotencyKey: 'announcement-announcement-1-member-2',
      }),
    ]);
  });

  it('archives the oldest non-pinned announcement when the group cap is reached', async () => {
    jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
    jest.spyOn(membershipRepository, 'findOne').mockResolvedValue(adminMembership);
    jest.spyOn(announcementRepository, 'count').mockResolvedValue(200);
    jest.spyOn(announcementRepository, 'findOne').mockResolvedValue({
      id: 'old-announcement',
      groupId: 'group-1',
      isPinned: false,
    } as Announcement);
    jest
      .spyOn(announcementRepository, 'save')
      .mockResolvedValue({ id: 'announcement-2' } as Announcement);

    await service.createAnnouncement('group-1', 'admin-1', {
      title: 'Cap test',
      body: 'Newest announcement',
    });

    expect(announcementRepository.softDelete).toHaveBeenCalledWith('old-announcement');
  });

  it('prevents non-members from listing announcements', async () => {
    jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
    jest.spyOn(membershipRepository, 'findOne').mockResolvedValue(null);

    await expect(
      service.listAnnouncements('group-1', 'outsider', { page: 1, limit: 20 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lists announcements with pinned items first', async () => {
    jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
    jest.spyOn(membershipRepository, 'findOne').mockResolvedValue(memberMembership);
    jest
      .spyOn(announcementRepository, 'findAndCount')
      .mockResolvedValue([[{ id: 'announcement-1', isPinned: true }], 1] as any);

    await service.listAnnouncements('group-1', 'member-1', { page: 1, limit: 20 });

    expect(announcementRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { isPinned: 'DESC', createdAt: 'DESC' },
      }),
    );
  });

  it('throws when updating a missing announcement', async () => {
    jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
    jest.spyOn(membershipRepository, 'findOne').mockResolvedValue(adminMembership);
    jest.spyOn(announcementRepository, 'findOne').mockResolvedValue(null);

    await expect(
      service.updateAnnouncement('group-1', 'missing', 'admin-1', {
        title: 'Updated title',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('soft-deletes announcements for group admins', async () => {
    jest.spyOn(groupRepository, 'findOne').mockResolvedValue(group);
    jest.spyOn(membershipRepository, 'findOne').mockResolvedValue(adminMembership);
    jest.spyOn(announcementRepository, 'findOne').mockResolvedValue({
      id: 'announcement-1',
      groupId: 'group-1',
    } as Announcement);

    await service.deleteAnnouncement('group-1', 'announcement-1', 'admin-1');

    expect(announcementRepository.softDelete).toHaveBeenCalledWith('announcement-1');
  });
});
