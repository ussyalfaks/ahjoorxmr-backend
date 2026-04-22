import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailerService } from '@nestjs-modules/mailer';
import { NotificationsService } from './notifications.service';
import { Notification } from './notification.entity';
import { NotificationType } from './notification-type.enum';
import { CreateNotificationDto } from './notifications.dto';

describe('NotificationsService - Batch Operations', () => {
  let service: NotificationsService;
  let repository: Repository<Notification>;

  const mockRepository = {
    create: jest.fn((dto) => dto),
    save: jest.fn((entities) => Promise.resolve(entities)),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    })),
  };

  const mockMailerService = {
    sendMail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getRepositoryToken(Notification),
          useValue: mockRepository,
        },
        {
          provide: MailerService,
          useValue: mockMailerService,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    repository = module.get<Repository<Notification>>(
      getRepositoryToken(Notification),
    );

    jest.clearAllMocks();
  });

  describe('notifyBatch', () => {
    it('should insert all notifications when no duplicates exist', async () => {
      const notifications: CreateNotificationDto[] = [
        {
          userId: 'user-1',
          type: NotificationType.ROUND_OPENED,
          title: 'Round 1',
          body: 'Round started',
          idempotencyKey: 'group-1-1-user-1-ROUND_OPENED',
        },
        {
          userId: 'user-2',
          type: NotificationType.ROUND_OPENED,
          title: 'Round 1',
          body: 'Round started',
          idempotencyKey: 'group-1-1-user-2-ROUND_OPENED',
        },
      ];

      const result = await service.notifyBatch(notifications);

      expect(mockRepository.save).toHaveBeenCalledTimes(1);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ userId: 'user-1' }),
          expect.objectContaining({ userId: 'user-2' }),
        ]),
      );
      expect(result).toHaveLength(2);
    });

    it('should deduplicate notifications with same idempotency key in batch', async () => {
      const notifications: CreateNotificationDto[] = [
        {
          userId: 'user-1',
          type: NotificationType.ROUND_OPENED,
          title: 'Round 1',
          body: 'Round started',
          idempotencyKey: 'group-1-1-user-1-ROUND_OPENED',
        },
        {
          userId: 'user-1',
          type: NotificationType.ROUND_OPENED,
          title: 'Round 1',
          body: 'Round started',
          idempotencyKey: 'group-1-1-user-1-ROUND_OPENED',
        },
      ];

      await service.notifyBatch(notifications);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ userId: 'user-1' })]),
      );
      expect(mockRepository.save.mock.calls[0][0]).toHaveLength(1);
    });

    it('should skip notifications with existing idempotency keys in DB', async () => {
      const notifications: CreateNotificationDto[] = [
        {
          userId: 'user-1',
          type: NotificationType.ROUND_OPENED,
          title: 'Round 1',
          body: 'Round started',
          idempotencyKey: 'group-1-1-user-1-ROUND_OPENED',
        },
      ];

      mockRepository.createQueryBuilder = jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([
            { n_idempotencyKey: 'group-1-1-user-1-ROUND_OPENED' },
          ]),
      }));

      const result = await service.notifyBatch(notifications);

      expect(mockRepository.save).not.toHaveBeenCalled();
      expect(result).toHaveLength(0);
    });

    it('should handle notifications without idempotency keys', async () => {
      const notifications: CreateNotificationDto[] = [
        {
          userId: 'user-1',
          type: NotificationType.ROUND_OPENED,
          title: 'Round 1',
          body: 'Round started',
        },
      ];

      await service.notifyBatch(notifications);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            userId: 'user-1',
            idempotencyKey: null,
          }),
        ]),
      );
    });

    it('should return empty array when given empty input', async () => {
      const result = await service.notifyBatch([]);

      expect(mockRepository.save).not.toHaveBeenCalled();
      expect(result).toHaveLength(0);
    });

    it('should handle mixed notifications with and without idempotency keys', async () => {
      const notifications: CreateNotificationDto[] = [
        {
          userId: 'user-1',
          type: NotificationType.ROUND_OPENED,
          title: 'Round 1',
          body: 'Round started',
          idempotencyKey: 'group-1-1-user-1-ROUND_OPENED',
        },
        {
          userId: 'user-2',
          type: NotificationType.CONTRIBUTION_REMINDER,
          title: 'Reminder',
          body: 'Please contribute',
        },
      ];

      mockRepository.createQueryBuilder = jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }));

      await service.notifyBatch(notifications);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            userId: 'user-1',
            idempotencyKey: 'group-1-1-user-1-ROUND_OPENED',
          }),
          expect.objectContaining({ userId: 'user-2', idempotencyKey: null }),
        ]),
      );
    });
  });

  describe('notify with idempotencyKey', () => {
    it('should save notification with idempotency key', async () => {
      const dto = {
        userId: 'user-1',
        type: NotificationType.ROUND_OPENED,
        title: 'Round 1',
        body: 'Round started',
        idempotencyKey: 'group-1-1-user-1-ROUND_OPENED',
      };

      mockRepository.save = jest
        .fn()
        .mockResolvedValue({ id: 'notif-1', ...dto });

      await service.notify(dto);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'group-1-1-user-1-ROUND_OPENED',
        }),
      );
    });
  });
});
