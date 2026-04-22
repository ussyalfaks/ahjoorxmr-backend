import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from '@/mail/services/mail.service';
import { TemplateService } from '@/mail/services/template.service';
import { NotificationType } from '@/common/types/email.types';
import * as nodemailer from 'nodemailer';

jest.mock('nodemailer');

describe('MailService', () => {
  let service: MailService;
  let templateService: TemplateService;
  let mockSendMail: jest.Mock;

  beforeEach(async () => {
    mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id-123' });

    (nodemailer.createTransport as jest.Mock).mockReturnValue({
      sendMail: mockSendMail,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [MailService, TemplateService],
    }).compile();

    service = module.get<MailService>(MailService);
    templateService = module.get<TemplateService>(TemplateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendEmail', () => {
    it('should send email with rendered template', async () => {
      const metadata = {
        recipientEmail: 'test@example.com',
        recipientName: 'John Doe',
        roundName: 'Series A',
        roundDescription: 'Test round',
        startDate: '2026-04-01',
        endDate: '2026-06-30',
        applicationDeadline: '2026-06-15',
        roundUrl: 'https://example.com/round',
      };

      const messageId = await service.sendEmail(NotificationType.ROUND_OPENED, metadata);

      expect(messageId).toBe('test-id-123');
      expect(mockSendMail).toHaveBeenCalledWith({
        from: expect.any(String),
        to: 'test@example.com',
        subject: expect.stringContaining('Funding Round'),
        html: expect.stringContaining('<html'),
      });
    });

    it('should use correct subject for each notification type', async () => {
      const baseMetadata = {
        recipientEmail: 'test@example.com',
        recipientName: 'Test',
      };

      const testCases = [
        {
          type: NotificationType.ROUND_OPENED,
          metadata: {
            ...baseMetadata,
            roundName: 'Test',
            roundDescription: 'Test',
            startDate: '2026-04-01',
            endDate: '2026-06-30',
            applicationDeadline: '2026-06-15',
            roundUrl: 'https://example.com',
          },
          subjectKeyword: 'Funding Round',
        },
        {
          type: NotificationType.PAYOUT_RECEIVED,
          metadata: {
            ...baseMetadata,
            payoutAmount: 1000,
            currency: 'USD',
            transactionId: 'TXN-123',
            projectName: 'Project',
            projectUrl: 'https://example.com',
            expectedDate: '2026-03-28',
          },
          subjectKeyword: 'Payout',
        },
        {
          type: NotificationType.PAYMENT_REMINDER,
          metadata: {
            ...baseMetadata,
            dueDate: '2026-04-15',
            amount: 1000,
            currency: 'USD',
            invoiceNumber: 'INV-123',
            paymentUrl: 'https://example.com',
          },
          subjectKeyword: 'Payment',
        },
      ];

      for (const { type, metadata, subjectKeyword } of testCases) {
        await service.sendEmail(type, metadata);

        const callArgs = mockSendMail.mock.calls[mockSendMail.mock.calls.length - 1][0];
        expect(callArgs.subject).toContain(subjectKeyword);
      }
    });

    it('should throw error if template rendering fails', async () => {
      const incompleteMeta data = {
        recipientEmail: 'test@example.com',
        recipientName: 'Test',
        // Missing required fields
      };

      await expect(
        service.sendEmail(NotificationType.ROUND_OPENED, incompleteMeta data),
      ).rejects.toThrow();
    });

    it('should throw error if email sending fails', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP error'));

      const metadata = {
        recipientEmail: 'test@example.com',
        recipientName: 'John Doe',
        roundName: 'Series A',
        roundDescription: 'Test round',
        startDate: '2026-04-01',
        endDate: '2026-06-30',
        applicationDeadline: '2026-06-15',
        roundUrl: 'https://example.com/round',
      };

      await expect(
        service.sendEmail(NotificationType.ROUND_OPENED, metadata),
      ).rejects.toThrow('SMTP error');
    });
  });

  describe('sendBulkEmails', () => {
    it('should send emails to multiple recipients and track success/failure', async () => {
      mockSendMail.mockResolvedValueOnce({ messageId: 'id-1' });
      mockSendMail.mockRejectedValueOnce(new Error('Failed'));
      mockSendMail.mockResolvedValueOnce({ messageId: 'id-2' });

      const recipients = [
        {
          recipientEmail: 'user1@example.com',
          recipientName: 'User 1',
          roundName: 'Series A',
          roundDescription: 'Test',
          startDate: '2026-04-01',
          endDate: '2026-06-30',
          applicationDeadline: '2026-06-15',
          roundUrl: 'https://example.com',
        },
        {
          recipientEmail: 'user2@example.com',
          recipientName: 'User 2',
          roundName: 'Series A',
          roundDescription: 'Test',
          startDate: '2026-04-01',
          endDate: '2026-06-30',
          applicationDeadline: '2026-06-15',
          roundUrl: 'https://example.com',
        },
        {
          recipientEmail: 'user3@example.com',
          recipientName: 'User 3',
          roundName: 'Series A',
          roundDescription: 'Test',
          startDate: '2026-04-01',
          endDate: '2026-06-30',
          applicationDeadline: '2026-06-15',
          roundUrl: 'https://example.com',
        },
      ];

      const result = await service.sendBulkEmails(NotificationType.ROUND_OPENED, recipients);

      expect(result.successful).toHaveLength(2);
      expect(result.failed).toHaveLength(1);
      expect(result.successful).toContain('user1@example.com');
      expect(result.successful).toContain('user3@example.com');
      expect(result.failed).toContain('user2@example.com');
    });
  });
});
