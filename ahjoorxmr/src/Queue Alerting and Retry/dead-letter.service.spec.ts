import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeadLetterService } from './dead-letter.service';
import { DeadLetterRecord } from './entities/dead-letter.entity';
import { NotificationService } from '../notifications/notification.service';
import { ConfigService } from '@nestjs/config';
import { NotificationType } from '../notifications/enum/notification-type.enum';

describe('DeadLetterService', () => {
  let service: DeadLetterService;
  let repository: Repository<DeadLetterRecord>;
  let notificationService: NotificationService;
  let configService: ConfigService;

  const mockDeadLetterRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
  };

  const mockNotificationService = {
    notifyAdmins: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      if (key === 'MAX_CONSECUTIVE_FAILURES') return 3;
      return defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadLetterService,
        {
          provide: getRepositoryToken(DeadLetterRecord),
          useValue: mockDeadLetterRepository,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<DeadLetterService>(DeadLetterService);
    repository = module.get<Repository<DeadLetterRecord>>(
      getRepositoryToken(DeadLetterRecord),
    );
    notificationService = module.get<NotificationService>(NotificationService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('recordDeadLetter', () => {
    it('should record a dead letter and notify admins', async () => {
      const payload = {
        jobId: 'job-123',
        groupId: 'group-1',
        jobType: 'EMAIL_SEND',
        payload: { email: 'test@example.com' },
        error: 'Connection timeout',
        attemptCount: 3,
      };

      const createdRecord = {
        id: 'record-1',
        ...payload,
        recordedAt: new Date(),
        status: 'PENDING',
      };

      mockDeadLetterRepository.create.mockReturnValue(createdRecord);
      mockDeadLetterRepository.save.mockResolvedValue(createdRecord);
      mockDeadLetterRepository.find.mockResolvedValue([]);

      const result = await service.recordDeadLetter(payload);

      expect(mockDeadLetterRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: payload.jobId,
          groupId: payload.groupId,
          jobType: payload.jobType,
          status: 'PENDING',
        }),
      );

      expect(mockDeadLetterRepository.save).toHaveBeenCalled();

      expect(mockNotificationService.notifyAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.SYSTEM_ALERT,
          title: expect.stringContaining('Job Failed'),
          message: expect.stringContaining(payload.jobType),
          severity: 'high',
        }),
      );

      expect(result).toEqual(createdRecord);
    });

    it('should include metadata in notification', async () => {
      const payload = {
        jobId: 'job-456',
        groupId: 'group-2',
        jobType: 'PROCESS_DATA',
        payload: { data: 'test' },
        error: 'Database error',
        attemptCount: 2,
      };

      const createdRecord = {
        id: 'record-2',
        ...payload,
        recordedAt: new Date(),
        status: 'PENDING',
      };

      mockDeadLetterRepository.create.mockReturnValue(createdRecord);
      mockDeadLetterRepository.save.mockResolvedValue(createdRecord);
      mockDeadLetterRepository.find.mockResolvedValue([]);

      await service.recordDeadLetter(payload);

      expect(mockNotificationService.notifyAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            jobId: payload.jobId,
            groupId: payload.groupId,
            jobType: payload.jobType,
            error: payload.error,
            attemptCount: payload.attemptCount,
          }),
        }),
      );
    });

    it('should continue recording even if notification fails', async () => {
      const payload = {
        jobId: 'job-789',
        groupId: 'group-3',
        jobType: 'SEND_NOTIFICATION',
        payload: {},
        error: 'Service unavailable',
        attemptCount: 1,
      };

      const createdRecord = {
        id: 'record-3',
        ...payload,
        recordedAt: new Date(),
        status: 'PENDING',
      };

      mockDeadLetterRepository.create.mockReturnValue(createdRecord);
      mockDeadLetterRepository.save.mockResolvedValue(createdRecord);
      mockDeadLetterRepository.find.mockResolvedValue([]);
      mockNotificationService.notifyAdmins.mockRejectedValueOnce(
        new Error('Notification service down'),
      );

      const result = await service.recordDeadLetter(payload);

      // Should still return the record even though notification failed
      expect(result).toEqual(createdRecord);
      expect(mockDeadLetterRepository.save).toHaveBeenCalled();
    });
  });

  describe('Circuit Breaker Logic', () => {
    it('should pause queue after N consecutive failures', async () => {
      const groupId = 'group-critical';

      // Create 3 records within the time window
      const now = new Date();
      const records = [
        {
          id: 'r1',
          groupId,
          jobId: 'j1',
          recordedAt: new Date(now.getTime()),
          status: 'PENDING',
        },
        {
          id: 'r2',
          groupId,
          jobId: 'j2',
          recordedAt: new Date(now.getTime() - 5 * 60 * 1000),
          status: 'PENDING',
        },
        {
          id: 'r3',
          groupId,
          jobId: 'j3',
          recordedAt: new Date(now.getTime() - 10 * 60 * 1000),
          status: 'PENDING',
        },
      ];

      const payload = {
        jobId: 'j1',
        groupId,
        jobType: 'CRITICAL_JOB',
        payload: {},
        error: 'Persistent error',
        attemptCount: 5,
      };

      const createdRecord = {
        id: 'r1',
        ...payload,
        recordedAt: new Date(),
        status: 'PENDING',
      };

      mockDeadLetterRepository.create.mockReturnValue(createdRecord);
      mockDeadLetterRepository.save.mockResolvedValue(createdRecord);
      mockDeadLetterRepository.find.mockResolvedValue(records);
      mockDeadLetterRepository.update.mockResolvedValue({ affected: 3 });

      await service.recordDeadLetter(payload);

      // Should emit critical alert
      expect(mockNotificationService.notifyAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.SYSTEM_ALERT,
          title: expect.stringContaining('CRITICAL'),
          severity: 'critical',
        }),
      );

      // Should mark records as PAUSED
      expect(mockDeadLetterRepository.update).toHaveBeenCalledWith(
        { groupId, status: 'PENDING' },
        { status: 'PAUSED' },
      );
    });

    it('should not pause queue before reaching MAX_CONSECUTIVE_FAILURES', async () => {
      const groupId = 'group-ok';
      const now = new Date();

      const records = [
        {
          id: 'r1',
          groupId,
          jobId: 'j1',
          recordedAt: new Date(now.getTime()),
          status: 'PENDING',
        },
        {
          id: 'r2',
          groupId,
          jobId: 'j2',
          recordedAt: new Date(now.getTime() - 5 * 60 * 1000),
          status: 'PENDING',
        },
      ];

      const payload = {
        jobId: 'j1',
        groupId,
        jobType: 'NORMAL_JOB',
        payload: {},
        error: 'Transient error',
        attemptCount: 2,
      };

      const createdRecord = {
        id: 'r1',
        ...payload,
        recordedAt: new Date(),
        status: 'PENDING',
      };

      mockDeadLetterRepository.create.mockReturnValue(createdRecord);
      mockDeadLetterRepository.save.mockResolvedValue(createdRecord);
      mockDeadLetterRepository.find.mockResolvedValue(records);

      await service.recordDeadLetter(payload);

      // Should NOT pause or send critical alert
      const criticalAlerts =
        mockNotificationService.notifyAdmins.mock.calls.filter(
          (call) => call[0].title && call[0].title.includes('CRITICAL'),
        );
      expect(criticalAlerts.length).toBe(0);
      expect(mockDeadLetterRepository.update).not.toHaveBeenCalled();
    });

    it('should send alert with consecutive failure count', async () => {
      const groupId = 'group-threshold';
      const maxFailures = 3;

      const now = new Date();
      const records = Array.from({ length: maxFailures }, (_, i) => ({
        id: `r${i}`,
        groupId,
        jobId: `j${i}`,
        recordedAt: new Date(now.getTime() - i * 5 * 60 * 1000),
        status: 'PENDING',
      }));

      const payload = {
        jobId: 'j-new',
        groupId,
        jobType: 'MONITORED_JOB',
        payload: {},
        error: 'Threshold reached',
        attemptCount: 1,
      };

      const createdRecord = {
        id: 'r-new',
        ...payload,
        recordedAt: new Date(),
        status: 'PENDING',
      };

      mockDeadLetterRepository.create.mockReturnValue(createdRecord);
      mockDeadLetterRepository.save.mockResolvedValue(createdRecord);
      mockDeadLetterRepository.find.mockResolvedValue(records);
      mockDeadLetterRepository.update.mockResolvedValue({ affected: 3 });

      await service.recordDeadLetter(payload);

      const criticalCall = mockNotificationService.notifyAdmins.mock.calls.find(
        (call) => call[0].title && call[0].title.includes('CRITICAL'),
      );

      expect(criticalCall).toBeDefined();
      expect(criticalCall[0].metadata).toEqual(
        expect.objectContaining({
          consecutiveFailures: expect.any(Number),
          maxAllowed: maxFailures,
        }),
      );
    });
  });

  describe('getDeadLetters', () => {
    it('should return paginated dead letters', async () => {
      const records = [
        { id: '1', jobId: 'j1', recordedAt: new Date() },
        { id: '2', jobId: 'j2', recordedAt: new Date() },
      ];

      mockDeadLetterRepository.findAndCount.mockResolvedValue([records, 100]);

      const result = await service.getDeadLetters(1, 50);

      expect(result.records).toEqual(records);
      expect(result.total).toBe(100);
      expect(result.page).toBe(1);

      expect(mockDeadLetterRepository.findAndCount).toHaveBeenCalledWith({
        order: { recordedAt: 'DESC' },
        skip: 0,
        take: 50,
      });
    });

    it('should handle pagination correctly', async () => {
      const records = [];
      mockDeadLetterRepository.findAndCount.mockResolvedValue([records, 200]);

      await service.getDeadLetters(3, 50);

      expect(mockDeadLetterRepository.findAndCount).toHaveBeenCalledWith({
        order: { recordedAt: 'DESC' },
        skip: 100, // (3 - 1) * 50
        take: 50,
      });
    });
  });

  describe('getDeadLettersByGroup', () => {
    it('should return dead letters filtered by group', async () => {
      const groupId = 'group-1';
      const records = [{ id: '1', groupId, recordedAt: new Date() }];

      mockDeadLetterRepository.findAndCount.mockResolvedValue([records, 5]);

      const result = await service.getDeadLettersByGroup(groupId, 1, 50);

      expect(result.records).toEqual(records);
      expect(result.total).toBe(5);

      expect(mockDeadLetterRepository.findAndCount).toHaveBeenCalledWith({
        where: { groupId },
        order: { recordedAt: 'DESC' },
        skip: 0,
        take: 50,
      });
    });
  });

  describe('resolveDeadLetter', () => {
    it('should mark a record as resolved', async () => {
      const recordId = 'record-1';
      const notes = 'Fixed upstream service';

      mockDeadLetterRepository.update.mockResolvedValue({ affected: 1 });

      await service.resolveDeadLetter(recordId, notes);

      expect(mockDeadLetterRepository.update).toHaveBeenCalledWith(
        { id: recordId },
        expect.objectContaining({
          status: 'RESOLVED',
          resolutionNotes: notes,
        }),
      );
    });
  });

  describe('resumeQueue', () => {
    it('should resume a paused queue', async () => {
      const groupId = 'group-paused';

      mockDeadLetterRepository.update.mockResolvedValue({ affected: 5 });

      await service.resumeQueue(groupId);

      // First call: change PAUSED to PENDING
      expect(mockDeadLetterRepository.update).toHaveBeenCalledWith(
        { groupId, status: 'PAUSED' },
        { status: 'PENDING' },
      );

      // Should send notification
      expect(mockNotificationService.notifyAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Queue Resumed'),
          severity: 'info',
        }),
      );
    });
  });

  describe('getGroupStatus', () => {
    it('should return group circuit breaker status', async () => {
      const groupId = 'group-status';
      const lastRecord = {
        id: 'last-1',
        groupId,
        status: 'PENDING',
        recordedAt: new Date(),
      };

      mockDeadLetterRepository.findOne.mockResolvedValue(lastRecord);

      const status = await service.getGroupStatus(groupId);

      expect(status.groupId).toBe(groupId);
      expect(status.isPaused).toBe(false);
      expect(status.lastFailure).toBeDefined();
    });

    it('should report paused status', async () => {
      const groupId = 'group-paused';
      const lastRecord = {
        id: 'last-1',
        groupId,
        status: 'PAUSED',
        recordedAt: new Date(),
      };

      mockDeadLetterRepository.findOne.mockResolvedValue(lastRecord);

      const status = await service.getGroupStatus(groupId);

      expect(status.isPaused).toBe(true);
    });
  });
});
