import { Test, TestingModule } from '@nestjs/testing';
import { TemplateService } from '@/mail/services/template.service';
import { NotificationType } from '@/common/types/email.types';

describe('TemplateService', () => {
  let service: TemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplateService],
    }).compile();

    service = module.get<TemplateService>(TemplateService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('renderTemplate', () => {
    it('should render ROUND_OPENED template with correct metadata', () => {
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

      const html = service.renderTemplate(NotificationType.ROUND_OPENED, metadata);

      expect(html).toContain('John Doe');
      expect(html).toContain('Series A');
      expect(html).toContain('Test round');
      expect(html).toContain('2026-04-01');
      expect(html).toContain('https://example.com/round');
      expect(html).toContain('<html');
    });

    it('should render PAYOUT_RECEIVED template with correct metadata', () => {
      const metadata = {
        recipientEmail: 'test@example.com',
        recipientName: 'Jane Smith',
        payoutAmount: 25000,
        currency: 'USD',
        transactionId: 'TXN-123',
        projectName: 'My Project',
        projectUrl: 'https://example.com/project',
        expectedDate: '2026-03-28',
      };

      const html = service.renderTemplate(NotificationType.PAYOUT_RECEIVED, metadata);

      expect(html).toContain('Jane Smith');
      expect(html).toContain('25000');
      expect(html).toContain('USD');
      expect(html).toContain('TXN-123');
      expect(html).toContain('My Project');
    });

    it('should render PAYMENT_REMINDER template with correct metadata', () => {
      const metadata = {
        recipientEmail: 'test@example.com',
        recipientName: 'Bob Johnson',
        dueDate: '2026-04-15',
        amount: 5000,
        currency: 'EUR',
        invoiceNumber: 'INV-456',
        paymentUrl: 'https://example.com/pay',
      };

      const html = service.renderTemplate(NotificationType.PAYMENT_REMINDER, metadata);

      expect(html).toContain('Bob Johnson');
      expect(html).toContain('2026-04-15');
      expect(html).toContain('5000');
      expect(html).toContain('EUR');
      expect(html).toContain('INV-456');
    });

    it('should throw error for invalid notification type', () => {
      const metadata = {
        recipientEmail: 'test@example.com',
        recipientName: 'Test',
      };

      expect(() => {
        service.renderTemplate('INVALID_TYPE' as NotificationType, metadata);
      }).toThrow();
    });

    it('should throw error if required fields are missing', () => {
      const incompleteMeta data = {
        recipientName: 'John Doe',
        // Missing required fields
      };

      expect(() => {
        service.renderTemplate(NotificationType.ROUND_OPENED, incompleteMeta data);
      }).toThrow('Missing required fields');
    });

    it('should handle conditional fields in payment reminder template', () => {
      const metadataWithOverdue = {
        recipientEmail: 'test@example.com',
        recipientName: 'Test User',
        dueDate: '2026-04-15',
        amount: 5000,
        currency: 'USD',
        invoiceNumber: 'INV-789',
        paymentUrl: 'https://example.com/pay',
        overdueDays: 5,
      };

      const html = service.renderTemplate(
        NotificationType.PAYMENT_REMINDER,
        metadataWithOverdue,
      );

      expect(html).toContain('5'); // overdueDays
      expect(html).toContain('overdue'); // Should mention overdue status
    });
  });

  describe('getAvailableTemplates', () => {
    it('should return all available templates', () => {
      const available = service.getAvailableTemplates();

      expect(available).toContain(NotificationType.ROUND_OPENED);
      expect(available).toContain(NotificationType.PAYOUT_RECEIVED);
      expect(available).toContain(NotificationType.PAYMENT_REMINDER);
      expect(available.length).toBe(3);
    });
  });
});
