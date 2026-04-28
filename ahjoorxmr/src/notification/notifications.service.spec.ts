import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MailerService } from '@nestjs-modules/mailer';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Notification } from './notification.entity';
import { NotificationType } from './notification-type.enum';
import { NotifyDto } from './notifications.dto';
import { NotificationPreferenceService } from './notification-preference.service';

const mockNotification = (): Notification => ({
  id: 'uuid-1',
  userId: 'user-1',
  type: NotificationType.ROUND_OPENED,
  title: 'Round Opened',
  body: 'A new round has started.',
  isRead: false,
  metadata: {},
  idempotencyKey: null,
  createdAt: new Date('2024-01-01'),
});

describe('NotificationsService', () => {
  let service: NotificationsService;

  const mockRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockMailer = {
    sendMail: jest.fn(),
  };

  const mockRedis = {
    getClient: jest.fn().mockReturnValue({ publish: jest.fn().mockResolvedValue(1) }),
  };

  const mockGateway = {
    emitNotification: jest.fn(),
  };

  const mockPrefService = {
    getChannelPreference: jest.fn().mockResolvedValue({ inApp: true, email: true, push: true }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: mockRepo },
        { provide: MailerService, useValue: mockMailer },
        { provide: 'RedisService', useValue: mockRedis },
        { provide: 'NotificationsGateway', useValue: mockGateway },
        { provide: NotificationPreferenceService, useValue: mockPrefService },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
    mockPrefService.getChannelPreference.mockResolvedValue({ inApp: true, email: true, push: true });
  });

  // ─── notify() ─────────────────────────────────────────────────────────────

  describe('notify()', () => {
    const dto: NotifyDto = {
      userId: 'user-1',
      type: NotificationType.ROUND_OPENED,
      title: 'Round Opened',
      body: 'Your round has started.',
    };

    it('creates and saves a notification', async () => {
      const created = mockNotification();
      mockRepo.create.mockReturnValue(created);
      mockRepo.save.mockResolvedValue(created);

      const result = await service.notify(dto);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: dto.userId, type: dto.type }),
      );
      expect(mockRepo.save).toHaveBeenCalledWith(created);
      expect(result).toEqual(created);
    });

    it('does NOT block on email — returns before email resolves', async () => {
      const created = mockNotification();
      mockRepo.create.mockReturnValue(created);
      mockRepo.save.mockResolvedValue(created);
      mockPrefService.getChannelPreference.mockResolvedValue({ inApp: true, email: true, push: true });

      let emailSent = false;
      mockMailer.sendMail.mockImplementation(
        () =>
          new Promise((r) =>
            setTimeout(() => {
              emailSent = true;
              r({});
            }, 200),
          ),
      );

      const emailDto: NotifyDto = {
        ...dto,
        sendEmail: true,
        emailTo: 'user@example.com',
      };

      const start = Date.now();
      await service.notify(emailDto);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(150); // returned well before email finished
      expect(emailSent).toBe(false);
    });

    it('sends email asynchronously when sendEmail=true and emailTo is provided', async () => {
      jest.useFakeTimers();
      const created = mockNotification();
      mockRepo.create.mockReturnValue(created);
      mockRepo.save.mockResolvedValue(created);
      mockMailer.sendMail.mockResolvedValue({});

      await service.notify({
        ...dto,
        sendEmail: true,
        emailTo: 'user@example.com',
        emailTemplateData: { groupName: 'Alpha' },
      });

      // Email not sent yet (scheduled with setImmediate)
      expect(mockMailer.sendMail).not.toHaveBeenCalled();

      // Flush microtasks + setImmediate
      await Promise.resolve();
      jest.runAllImmediates();
      await Promise.resolve();

      expect(mockMailer.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'user@example.com',
          template: 'round-opened',
          context: expect.objectContaining({ groupName: 'Alpha' }),
        }),
      );
      jest.useRealTimers();
    });

    it('does NOT send email when sendEmail=false', async () => {
      jest.useFakeTimers();
      const created = mockNotification();
      mockRepo.create.mockReturnValue(created);
      mockRepo.save.mockResolvedValue(created);

      await service.notify({ ...dto, sendEmail: false, emailTo: 'x@x.com' });
      jest.runAllImmediates();
      await Promise.resolve();

      expect(mockMailer.sendMail).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('does NOT send email when emailTo is missing', async () => {
      jest.useFakeTimers();
      const created = mockNotification();
      mockRepo.create.mockReturnValue(created);
      mockRepo.save.mockResolvedValue(created);

      await service.notify({ ...dto, sendEmail: true });
      jest.runAllImmediates();
      await Promise.resolve();

      expect(mockMailer.sendMail).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('does NOT send email for types without a template (e.g. MEMBER_JOINED)', async () => {
      jest.useFakeTimers();
      const n = { ...mockNotification(), type: NotificationType.MEMBER_JOINED };
      mockRepo.create.mockReturnValue(n);
      mockRepo.save.mockResolvedValue(n);

      await service.notify({
        ...dto,
        type: NotificationType.MEMBER_JOINED,
        sendEmail: true,
        emailTo: 'user@example.com',
      });
      jest.runAllImmediates();
      await Promise.resolve();

      expect(mockMailer.sendMail).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('logs and swallows email errors without propagating', async () => {
      jest.useFakeTimers();
      const created = mockNotification();
      mockRepo.create.mockReturnValue(created);
      mockRepo.save.mockResolvedValue(created);
      mockMailer.sendMail.mockRejectedValue(new Error('SMTP failure'));

      await expect(
        service.notify({ ...dto, sendEmail: true, emailTo: 'x@x.com' }),
      ).resolves.not.toThrow();

      jest.runAllImmediates();
      await Promise.resolve();
      // No uncaught rejection
      jest.useRealTimers();
    });
  });

  // ─── Preference-gating ────────────────────────────────────────────────────

  describe('notify() with preferences', () => {
    const dto: NotifyDto = {
      userId: 'user-1',
      type: NotificationType.ROUND_OPENED,
      title: 'Round Opened',
      body: 'Your round has started.',
      sendEmail: true,
      emailTo: 'user@example.com',
    };

    it('skips in-app insert when inApp preference is disabled', async () => {
      mockPrefService.getChannelPreference.mockResolvedValue({ inApp: false, email: true, push: true });

      const result = await service.notify(dto);

      expect(mockRepo.create).not.toHaveBeenCalled();
      expect(mockRepo.save).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('skips email when email preference is disabled', async () => {
      jest.useFakeTimers();
      const created = mockNotification();
      mockRepo.create.mockReturnValue(created);
      mockRepo.save.mockResolvedValue(created);
      mockPrefService.getChannelPreference.mockResolvedValue({ inApp: true, email: false, push: true });

      await service.notify(dto);
      jest.runAllImmediates();
      await Promise.resolve();

      expect(mockMailer.sendMail).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('sends email when both inApp and email are enabled', async () => {
      jest.useFakeTimers();
      const created = mockNotification();
      mockRepo.create.mockReturnValue(created);
      mockRepo.save.mockResolvedValue(created);
      mockPrefService.getChannelPreference.mockResolvedValue({ inApp: true, email: true, push: true });
      mockMailer.sendMail.mockResolvedValue({});

      await service.notify(dto);
      jest.runAllImmediates();
      await Promise.resolve();

      expect(mockRepo.save).toHaveBeenCalled();
      expect(mockMailer.sendMail).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('notifyBatch() with preferences', () => {
    it('skips in-app insert for users with inApp disabled', async () => {
      mockPrefService.getChannelPreference.mockResolvedValue({ inApp: false, email: true, push: true });
      mockRepo.createQueryBuilder = jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }));

      const result = await service.notifyBatch([
        { userId: 'user-1', type: NotificationType.ROUND_OPENED, title: 'T', body: 'B' },
      ]);

      expect(mockRepo.save).not.toHaveBeenCalled();
      expect(result).toHaveLength(0);
    });

    it('only inserts notifications for users with inApp enabled', async () => {
      mockPrefService.getChannelPreference
        .mockResolvedValueOnce({ inApp: true, email: true, push: true })  // user-1
        .mockResolvedValueOnce({ inApp: false, email: true, push: true }); // user-2

      mockRepo.createQueryBuilder = jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }));
      mockRepo.create.mockImplementation((d) => d);
      mockRepo.save.mockImplementation((arr) => Promise.resolve(arr));

      const result = await service.notifyBatch([
        { userId: 'user-1', type: NotificationType.ROUND_OPENED, title: 'T', body: 'B' },
        { userId: 'user-2', type: NotificationType.ROUND_OPENED, title: 'T', body: 'B' },
      ]);

      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ userId: 'user-1' })]),
      );
      expect(result).toHaveLength(1);
    });
  });

  // ─── findAll() ────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns paginated notifications for user', async () => {
      const items = [mockNotification()];
      mockRepo.findAndCount.mockResolvedValue([items, 1]);

      const result = await service.findAll('user-1', { page: 1, limit: 20 });

      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
          order: { createdAt: 'DESC' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result).toEqual({
        data: items,
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('filters by type when provided', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll('user-1', {
        page: 1,
        limit: 10,
        type: NotificationType.CONTRIBUTION_REMINDER,
      });

      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            type: NotificationType.CONTRIBUTION_REMINDER,
          },
        }),
      );
    });

    it('computes correct skip for page 2', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 0]);

      await service.findAll('user-1', { page: 2, limit: 10 });

      expect(mockRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('returns correct totalPages', async () => {
      mockRepo.findAndCount.mockResolvedValue([[], 55]);

      const result = await service.findAll('user-1', { page: 1, limit: 20 });
      expect(result.totalPages).toBe(3);
    });
  });

  // ─── markAsRead() ─────────────────────────────────────────────────────────

  describe('markAsRead()', () => {
    it('marks notification as read', async () => {
      const n = mockNotification();
      mockRepo.findOne.mockResolvedValue(n);
      mockRepo.save.mockResolvedValue({ ...n, isRead: true });

      const result = await service.markAsRead('uuid-1', 'user-1');
      expect(result.isRead).toBe(true);
      expect(mockRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isRead: true }),
      );
    });

    it('throws NotFoundException when notification not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await expect(service.markAsRead('missing', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when userId does not match', async () => {
      mockRepo.findOne.mockResolvedValue({
        ...mockNotification(),
        userId: 'user-2',
      });

      await expect(service.markAsRead('uuid-1', 'user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  // ─── markAllAsRead() ──────────────────────────────────────────────────────

  describe('markAllAsRead()', () => {
    it('updates all unread notifications and returns affected count', async () => {
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 5 }),
      };
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.markAllAsRead('user-1');
      expect(result).toEqual({ updated: 5 });
      expect(qb.set).toHaveBeenCalledWith({ isRead: true });
      expect(qb.where).toHaveBeenCalledWith(
        'userId = :userId AND isRead = false',
        { userId: 'user-1' },
      );
    });

    it('returns updated:0 when no unread notifications', async () => {
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.markAllAsRead('user-1');
      expect(result).toEqual({ updated: 0 });
    });
  });

  // ─── getUnreadCount() ─────────────────────────────────────────────────────

  describe('getUnreadCount()', () => {
    it('returns unread notification count', async () => {
      mockRepo.count.mockResolvedValue(7);
      const count = await service.getUnreadCount('user-1');
      expect(count).toBe(7);
      expect(mockRepo.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRead: false },
      });
    });
  });
});
