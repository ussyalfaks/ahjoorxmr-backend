import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { EmailProcessor } from '../../queue/processors/email.processor';
import { DeadLetterService } from '../../queue/dead-letter.service';
import { JOB_NAMES, QUEUE_NAMES } from '../../queue/queue.constants';

const makeJob = (
  name: string,
  data: unknown,
  overrides: Partial<Job> = {},
): Job =>
  ({
    id: 'test-job-id',
    name,
    data,
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  }) as unknown as Job;

describe('EmailProcessor', () => {
  let processor: EmailProcessor;
  let deadLetterService: jest.Mocked<DeadLetterService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        {
          provide: DeadLetterService,
          useValue: {
            moveToDeadLetter: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    processor = module.get(EmailProcessor);
    deadLetterService = module.get(DeadLetterService);
  });

  afterEach(() => jest.clearAllMocks());

  // ---------------------------------------------------------------------------
  // process()
  // ---------------------------------------------------------------------------
  describe('process()', () => {
    it('should process SEND_EMAIL job', async () => {
      const job = makeJob(JOB_NAMES.SEND_EMAIL, {
        to: 'user@example.com',
        subject: 'Hello',
        html: '<p>Hi</p>',
      });
      await expect(processor.process(job)).resolves.not.toThrow();
    });

    it('should process SEND_NOTIFICATION_EMAIL job', async () => {
      const job = makeJob(JOB_NAMES.SEND_NOTIFICATION_EMAIL, {
        userId: 'u1',
        notificationType: 'GROUP_INVITE',
        to: 'user@example.com',
        subject: 'You have an invitation',
      });
      await expect(processor.process(job)).resolves.not.toThrow();
    });

    it('should process SEND_WELCOME_EMAIL job', async () => {
      const job = makeJob(JOB_NAMES.SEND_WELCOME_EMAIL, {
        userId: 'u1',
        email: 'newuser@example.com',
        username: 'Alice',
      });
      await expect(processor.process(job)).resolves.not.toThrow();
    });

    it('should throw for unknown job name', async () => {
      const job = makeJob('unknown-job', {});
      await expect(processor.process(job)).rejects.toThrow(
        'Unknown email job type: unknown-job',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // onFailed()
  // ---------------------------------------------------------------------------
  describe('onFailed()', () => {
    it('should NOT call moveToDeadLetter when retries are not exhausted', async () => {
      const job = makeJob(JOB_NAMES.SEND_EMAIL, {}, {
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as any);
      await processor.onFailed(job, new Error('SMTP timeout'));
      expect(deadLetterService.moveToDeadLetter).not.toHaveBeenCalled();
    });

    it('should call moveToDeadLetter when all retries are exhausted', async () => {
      const job = makeJob(
        JOB_NAMES.SEND_EMAIL,
        { to: 'a@b.com', subject: 'x' },
        {
          attemptsMade: 3,
          opts: { attempts: 3 },
        } as any,
      );
      await processor.onFailed(job, new Error('SMTP failed permanently'));
      expect(deadLetterService.moveToDeadLetter).toHaveBeenCalledWith(
        job,
        expect.any(Error),
        QUEUE_NAMES.EMAIL,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // onCompleted() / onStalled()
  // ---------------------------------------------------------------------------
  describe('event handlers', () => {
    it('onCompleted should not throw', () => {
      const job = makeJob(JOB_NAMES.SEND_EMAIL, {});
      expect(() => processor.onCompleted(job)).not.toThrow();
    });

    it('onStalled should not throw', () => {
      expect(() => processor.onStalled('job-id-123')).not.toThrow();
    });
  });
});
