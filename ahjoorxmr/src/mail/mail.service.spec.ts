import { Test, TestingModule } from '@nestjs/testing';
import { MailService, TEMPLATE_SAMPLE_DATA } from './mail.service';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { NotFoundException } from '@nestjs/common';

const TEMPLATES = [
  'welcome',
  'email-verification',
  'password-reset',
  '2fa-backup-code-used',
  'kyc-approved',
  'kyc-declined',
  'data-export-ready',
  'payout-received',
  'contribution-confirmed',
];

describe('MailService', () => {
  let service: MailService;

  const mockMailerService = {
    sendMail: jest.fn().mockResolvedValue(true),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        APP_URL: 'http://localhost:3000',
        MAIL_LOCALE: 'en',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: MailerService, useValue: mockMailerService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── Template compile + snapshot tests ──────────────────────────────────────

  describe('compileTemplate', () => {
    it.each(TEMPLATES)('%s compiles without errors', (template) => {
      const context = TEMPLATE_SAMPLE_DATA[template] ?? {};
      expect(() => service.compileTemplate(template, context)).not.toThrow();
    });

    it.each(TEMPLATES)('%s snapshot', (template) => {
      const context = TEMPLATE_SAMPLE_DATA[template] ?? {};
      const html = service.compileTemplate(template, context);
      expect(html).toMatchSnapshot();
    });

    it('throws NotFoundException for unknown template', () => {
      expect(() =>
        service.compileTemplate('non-existent', {}),
      ).toThrow(NotFoundException);
    });

    it('loads locale-specific template when MAIL_LOCALE is set', () => {
      // Falls back to en since only en exists; verifies locale path resolution
      const html = service.compileTemplate('welcome', TEMPLATE_SAMPLE_DATA['welcome'], 'en');
      expect(html).toContain('Welcome');
    });
  });

  // ── send() uses compiled HTML ───────────────────────────────────────────────

  describe('send', () => {
    it('sends compiled HTML via mailerService', async () => {
      await service.send(
        'welcome',
        TEMPLATE_SAMPLE_DATA['welcome'],
        { to: 'test@example.com', subject: 'Welcome' },
      );

      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Welcome',
          html: expect.stringContaining('<html'),
          template: undefined,
        }),
      );
    });
  });

  // ── Legacy sendMail ─────────────────────────────────────────────────────────

  describe('sendMail', () => {
    it('sends email successfully', async () => {
      await service.sendMail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'test@example.com', subject: 'Test' }),
      );
    });

    it('throws when mailerService fails', async () => {
      mockMailerService.sendMail.mockRejectedValueOnce(new Error('Send failed'));
      await expect(
        service.sendMail({ to: 'x@x.com', subject: 'x', html: '<p>x</p>' }),
      ).rejects.toThrow('Send failed');
    });
  });

  // ── Convenience methods ─────────────────────────────────────────────────────

  describe('sendWelcomeEmail', () => {
    it('sends welcome email with compiled HTML', async () => {
      await service.sendWelcomeEmail('test@example.com', 'John Doe');
      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Welcome to Ahjoorxmr!',
          html: expect.stringContaining('John Doe'),
        }),
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('sends password reset email with compiled HTML', async () => {
      await service.sendPasswordResetEmail('test@example.com', 'John Doe', 'reset-token-123');
      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Password Reset Request',
          html: expect.stringContaining('reset-token-123'),
        }),
      );
    });
  });

  describe('sendEmailVerification', () => {
    it('sends email verification with compiled HTML', async () => {
      await service.sendEmailVerification('test@example.com', 'John Doe', 'verify-token-123');
      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Verify Your Email Address',
          html: expect.stringContaining('verify-token-123'),
        }),
      );
    });
  });

  describe('sendGroupInvitationEmail', () => {
    it('sends group invitation email', async () => {
      await service.sendGroupInvitationEmail(
        'test@example.com', 'John Doe', 'Test Group', 'Jane Smith', 'invite-token-123',
      );
      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "You've been invited to join Test Group",
          template: 'en/group-invitation',
        }),
      );
    });
  });

  describe('sendNotificationEmail', () => {
    it('sends notification email', async () => {
      await service.sendNotificationEmail(
        'test@example.com', 'John Doe', 'Test Notification', 'Body text',
        'http://localhost:3000/action',
      );
      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Test Notification',
          context: expect.objectContaining({ actionLink: 'http://localhost:3000/action' }),
        }),
      );
    });

    it('defaults actionLink to # when not provided', async () => {
      await service.sendNotificationEmail('test@example.com', 'John Doe', 'Title', 'Body');
      expect(mockMailerService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({ actionLink: '#' }),
        }),
      );
    });
  });
});
