import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';

import { Notification } from '../entities/notification.entity';
import { NotificationType } from '../enums/notification-type.enum';
import { NotificationsService } from './notifications.service';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-1',
    userId: 'user-1',
    type: NotificationType.CONTRIBUTION_REMINDER,
    metadata: {},
    idempotencyKey: 'key-1',
    read: false,
    createdAt: new Date(),
    ...overrides,
  } as Notification;
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let repo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: repo },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  const basePayload = {
    userId: 'user-1',
    type: NotificationType.CONTRIBUTION_REMINDER,
    metadata: { groupName: 'Ajo', roundNumber: 1 },
    idempotencyKey: 'CONTRIBUTION_REMINDER:user-1:group-1:1:2026-03-27',
  };

  describe('notify — new notification', () => {
    it('persists and returns created=true when no duplicate exists', async () => {
      repo.findOne.mockResolvedValue(null);
      const notif = makeNotification();
      repo.create.mockReturnValue(notif);
      repo.save.mockResolvedValue(notif);

      const result = await service.notify(basePayload);

      expect(result.created).toBe(true);
      expect(result.notification).toBe(notif);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('passes userId, type, metadata, and idempotencyKey to create()', async () => {
      repo.findOne.mockResolvedValue(null);
      const notif = makeNotification();
      repo.create.mockReturnValue(notif);
      repo.save.mockResolvedValue(notif);

      await service.notify(basePayload);

      expect(repo.create).toHaveBeenCalledWith({
        userId: basePayload.userId,
        type: basePayload.type,
        metadata: basePayload.metadata,
        idempotencyKey: basePayload.idempotencyKey,
      });
    });
  });

  describe('notify — idempotency fast-path', () => {
    it('returns created=false without saving when key already exists', async () => {
      repo.findOne.mockResolvedValue(makeNotification());

      const result = await service.notify(basePayload);

      expect(result.created).toBe(false);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('returns the existing notification in the result', async () => {
      const existing = makeNotification({ id: 'existing-notif' });
      repo.findOne.mockResolvedValue(existing);

      const result = await service.notify(basePayload);

      expect(result.notification).toBe(existing);
    });
  });

  describe('notify — race-condition dedup (unique constraint violation)', () => {
    it('returns created=false on Postgres unique violation (code 23505)', async () => {
      repo.findOne.mockResolvedValue(null); // passes fast-path
      repo.create.mockReturnValue(makeNotification());

      const pgError = Object.assign(
        new QueryFailedError('INSERT', [], new Error()),
        { code: '23505' },
      );
      repo.save.mockRejectedValue(pgError);

      const result = await service.notify(basePayload);

      expect(result.created).toBe(false);
    });

    it('re-throws non-unique-violation database errors', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue(makeNotification());

      const otherError = Object.assign(
        new QueryFailedError('INSERT', [], new Error()),
        { code: '23503' }, // foreign key violation, not a dupe
      );
      repo.save.mockRejectedValue(otherError);

      await expect(service.notify(basePayload)).rejects.toThrow(
        QueryFailedError,
      );
    });
  });

  describe('notify — no idempotencyKey', () => {
    it('skips findOne lookup and proceeds to save directly', async () => {
      const notif = makeNotification({ idempotencyKey: undefined });
      repo.create.mockReturnValue(notif);
      repo.save.mockResolvedValue(notif);

      const payloadWithoutKey = { ...basePayload, idempotencyKey: undefined };
      const result = await service.notify(payloadWithoutKey);

      expect(repo.findOne).not.toHaveBeenCalled();
      expect(result.created).toBe(true);
    });
  });
});
