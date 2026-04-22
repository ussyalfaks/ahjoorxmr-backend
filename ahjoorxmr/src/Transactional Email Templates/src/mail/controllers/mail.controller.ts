import {
  Controller,
  Get,
  Param,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { TemplateService } from '@/mail/services/template.service';
import { NotificationType } from '@/common/types/email.types';

/**
 * Sample metadata for each notification type (for preview purposes)
 */
const SAMPLE_METADATA = {
  [NotificationType.ROUND_OPENED]: {
    recipientEmail: 'founder@example.com',
    recipientName: 'Jane Founder',
    roundName: 'Series A Equity Round',
    roundDescription:
      'We are opening a new funding round for early-stage startups in the fintech space.',
    startDate: '2026-04-01',
    endDate: '2026-06-30',
    applicationDeadline: '2026-06-15',
    roundUrl: 'https://fundingplatform.com/rounds/series-a-2026',
  },
  [NotificationType.PAYOUT_RECEIVED]: {
    recipientEmail: 'founder@example.com',
    recipientName: 'Jane Founder',
    payoutAmount: 50000,
    currency: 'USD',
    transactionId: 'TXN-2026-001234',
    projectName: 'AI Analytics Platform',
    projectUrl: 'https://fundingplatform.com/projects/ai-analytics',
    expectedDate: '2026-03-28',
  },
  [NotificationType.PAYMENT_REMINDER]: {
    recipientEmail: 'investor@example.com',
    recipientName: 'John Investor',
    dueDate: '2026-04-15',
    amount: 10000,
    currency: 'USD',
    invoiceNumber: 'INV-2026-005678',
    paymentUrl: 'https://fundingplatform.com/payments/INV-2026-005678',
    overdueDays: null, // Not overdue
  },
};

@Controller('api/v1/mail')
export class MailController {
  private readonly logger = new Logger(MailController.name);

  constructor(private readonly templateService: TemplateService) {}

  /**
   * Preview email template (dev-only endpoint)
   * GET /api/v1/mail/preview/:type
   *
   * Example: GET /api/v1/mail/preview/ROUND_OPENED
   */
  @Get('preview/:type')
  previewTemplate(@Param('type') type: string): { html: string; type: string } {
    // Ensure dev-only access
    if (process.env.NODE_ENV === 'production') {
      throw new BadRequestException(
        'Template preview is not available in production',
      );
    }

    // Validate notification type
    if (!Object.values(NotificationType).includes(type as NotificationType)) {
      throw new BadRequestException(
        `Invalid notification type. Allowed values: ${Object.values(NotificationType).join(', ')}`,
      );
    }

    try {
      const notificationType = type as NotificationType;
      const templateMetadata = SAMPLE_METADATA[notificationType];

      if (!templateMetadata) {
        throw new BadRequestException(
          `Sample metadata not found for notification type: ${type}`,
        );
      }

      // Render template with sample data
      const html = this.templateService.renderTemplate(
        notificationType,
        templateMetadata,
      );

      this.logger.debug(`Template preview rendered for ${type}`);
      return {
        html,
        type: notificationType,
      };
    } catch (error) {
      this.logger.error(`Failed to render template preview: ${error.message}`);

      // Graceful fallback for malformed metadata or rendering errors
      if (error.message.includes('Missing required fields')) {
        throw new BadRequestException(
          `Incomplete sample metadata: ${error.message}`,
        );
      }

      throw new BadRequestException(
        `Failed to render template: ${error.message}`,
      );
    }
  }

  /**
   * List available email template types
   * GET /api/v1/mail/templates
   */
  @Get('templates')
  listTemplates(): { types: NotificationType[] } {
    const available = this.templateService.getAvailableTemplates();
    return {
      types: available,
    };
  }
}
