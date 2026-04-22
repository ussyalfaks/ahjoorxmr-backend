import { Injectable, Logger } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { NotificationType, EmailMetadata } from '@/common/types/email.types';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);
  private templates: Map<NotificationType, Handlebars.TemplateDelegate> =
    new Map();
  private readonly templatesPath = path.join(process.cwd(), 'templates');

  constructor() {
    this.loadTemplates();
  }

  private loadTemplates(): void {
    const templateMappings: { [key in NotificationType]: string } = {
      [NotificationType.ROUND_OPENED]: 'round-opened.hbs',
      [NotificationType.PAYOUT_RECEIVED]: 'payout-received.hbs',
      [NotificationType.PAYMENT_REMINDER]: 'payment-reminder.hbs',
    };

    for (const [notificationType, templateFile] of Object.entries(
      templateMappings,
    )) {
      try {
        const templatePath = path.join(this.templatesPath, templateFile);
        const templateContent = fs.readFileSync(templatePath, 'utf-8');
        const compiled = Handlebars.compile(templateContent);
        this.templates.set(notificationType as NotificationType, compiled);
        this.logger.debug(`Loaded template for ${notificationType}`);
      } catch (error) {
        this.logger.error(
          `Failed to load template ${templateFile}: ${error.message}`,
        );
      }
    }
  }

  /**
   * Render a template with metadata
   * @param notificationType - The type of notification
   * @param metadata - The metadata to render into the template
   * @returns The rendered HTML
   * @throws Error if template is not found or rendering fails
   */
  renderTemplate(
    notificationType: NotificationType,
    metadata: EmailMetadata,
  ): string {
    try {
      const template = this.templates.get(notificationType);
      if (!template) {
        throw new Error(
          `Template not found for notification type: ${notificationType}`,
        );
      }

      // Validate metadata has required fields
      this.validateMetadata(notificationType, metadata);

      return template(metadata);
    } catch (error) {
      this.logger.error(
        `Failed to render template: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Get available templates for preview
   */
  getAvailableTemplates(): NotificationType[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Validate metadata has required fields for a given notification type
   */
  private validateMetadata(
    notificationType: NotificationType,
    metadata: EmailMetadata,
  ): void {
    const requiredFields: { [key in NotificationType]: string[] } = {
      [NotificationType.ROUND_OPENED]: [
        'recipientEmail',
        'recipientName',
        'roundName',
        'roundDescription',
        'startDate',
        'endDate',
        'applicationDeadline',
        'roundUrl',
      ],
      [NotificationType.PAYOUT_RECEIVED]: [
        'recipientEmail',
        'recipientName',
        'payoutAmount',
        'currency',
        'transactionId',
        'projectName',
        'projectUrl',
        'expectedDate',
      ],
      [NotificationType.PAYMENT_REMINDER]: [
        'recipientEmail',
        'recipientName',
        'dueDate',
        'amount',
        'currency',
        'invoiceNumber',
        'paymentUrl',
      ],
    };

    const required = requiredFields[notificationType] || [];
    const missing = required.filter((field) => !metadata.hasOwnProperty(field));

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
  }
}
