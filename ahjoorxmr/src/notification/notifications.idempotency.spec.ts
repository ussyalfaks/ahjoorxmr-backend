import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailerService } from '@nestjs-modules/mailer';
import { NotificationsService } from './notifications.service';
import { Notification } from './notification.entity';
import { NotificationType } from './notification-type.enum';
import { CreateNotificationDto } from './notifications.dto';

describe('NotificationsService - Idempotency Integration', () => {
  let service: NotificationsService;
  let repository: Repository<Notification>;

  const mockMailerService = {
    sendMail: jest.fn(),
  };

  beforeEach(async () => {
    const mockRepository = {
      create: jest.fn((dto) => ({ id: 'mock-id', ...dto })),
      save: jest.fn((entities) => {
        if (Array.isArray(entities)) {
          return Promise.resolve(
            entities.map((e, i) => ({ id: `notif-${i}`, ...e })),
          );
        }
        return Promise.resolve({ id: 'notif-single', ...entities });
      }),
      createQueryBuilder: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      })),
    };

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

  describe('Scheduler Retry Scenario', () => {
    it('should not create duplicates when scheduler retries the same job', async () => {
      const notifications: CreateNotificationDto[] = [
        {
          userId: 'user-1',
          type: NotificationType.ROUND_OPENED,
          title: 'Round 2',
          body: 'Round started',
          idempotencyKey: 'group-123-2-user-1-ROUND_OPENED',
        },
        {
          userId: 'user-2',
          type: NotificationType.ROUND_OPENED,
          title: 'Round 2',
          body: 'Round started',
          idempotencyKey: 'group-123-2-user-2-ROUND_OPENED',
        },
      ];

      // First execution
      const firstResult = await service.notifyBatch(notifications);
      expect(firstResult).toHaveLength(2);
      expect(repository.save).toHaveBeenCalledTimes(1);

      // Simulate scheduler retry - mock DB now has these keys
      (repository.createQueryBuilder as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([
            { n_idempotencyKey: 'group-123-2-user-1-ROUND_OPENED' },
            { n_idempotencyKey: 'group-123-2-user-2-ROUND_OPENED' },
          ]),
      });

      // Second execution (retry)
      const secondResult = await service.notifyBatch(notifications);
      expect(secondResult).toHaveLength(0);
      expect(repository.save).toHaveBeenCalledTimes(1); // Still only called once
    });

    it('should handle partial duplicates in retry scenario', async () => {
      const notifications: CreateNotificationDto[] = [
        {
          userId: 'user-1',
          type: NotificationType.ROUND_OPENED,
          title: 'Round 3',
          body: 'Round started',
          idempotencyKey: 'group-123-3-user-1-ROUND_OPENED',
        },
        {
          userId: 'user-2',
          type: NotificationType.ROUND_OPENED,
          title: 'Round 3',
          body: 'Round started',
          idempotencyKey: 'group-123-3-user-2-ROUND_OPENED',
        },
        {
          userId: 'user-3',
          type: NotificationType.ROUND_OPENED,
          title: 'Round 3',
          body: 'Round started',
          idempotencyKey: 'group-123-3-user-3-ROUND_OPENED',
        },
      ];

      // Simulate partial success - only user-1 was saved before crash
      (repository.createQueryBuilder as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest
          .fn()
          .mockResolvedValue([
            { n_idempotencyKey: 'group-123-3-user-1-ROUND_OPENED' },
          ]),
      });

      const result = await service.notifyBatch(notifications);

      expect(result).toHaveLength(2);
      expect(repository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ userId: 'user-2' }),
          expect.objectContaining({ userId: 'user-3' }),
        ]),
      );
      expect(repository.save).not.toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ userId: 'user-1' })]),
      );
    });
  });

  describe('Large Group Scenario', () => {
    it('should efficiently handle batch insert for 100 members', async () => {
      const notifications: CreateNotificationDto[] = Array.from(
        { length: 100 },
        (_, i) => ({
          userId: `user-${i}`,
          type: NotificationType.ROUND_OPENED,
          title: 'Round 1',
          body: 'Round started',
          idempotencyKey: `group-large-1-user-${i}-ROUND_OPENED`,
        }),
      );

      const result = await service.notifyBatch(notifications);

      expect(result).toHaveLength(100);
      expect(repository.save).toHaveBeenCalledTimes(1); // Single batch insert
      expect(repository.save).toHaveBeenCalledWith(expect.any(Array));
      expect(repository.save.mock.calls[0][0]).toHaveLength(100);
    });
  });

  describe('Idempotency Key Format', () => {
    it('should accept standard format: groupId-round-userId-type', async () => {
      const notification: CreateNotificationDto = {
        userId: 'user-1',
        type: NotificationType.ROUND_OPENED,
        title: 'Round 1',
        body: 'Round started',
        idempotencyKey: 'abc123-5-xyz789-ROUND_OPENED',
      };

      await service.notifyBatch([notification]);

      expect(repository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            idempotencyKey: 'abc123-5-xyz789-ROUND_OPENED',
          }),
        ]),
      );
    });
  });
});
