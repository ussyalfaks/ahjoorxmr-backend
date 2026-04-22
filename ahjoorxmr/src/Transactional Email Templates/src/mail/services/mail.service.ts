import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { TemplateService } from './template.service';
import { NotificationType, EmailMetadata } from '@/common/types/email.types';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly templateService: TemplateService) {
    this.initializeTransporter();
  }

  private initializeTransporter(): void {
    // For development, use Ethereal Email or similar service
    // For production, use actual SMTP credentials from environment
    if (process.env.NODE_ENV === 'production') {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      });
    } else {
      // Development: use test account
      this.transporter = nodemailer.createTransport({
        host: 'smtp.mailtrap.io',
        port: 2525,
        auth: {
          user: process.env.MAILTRAP_USER || 'demo',
          pass: process.env.MAILTRAP_PASSWORD || 'demo',
        },
      });
    }
  }

  /**
   * Send email with rendered template
   */
  async sendEmail(
    notificationType: NotificationType,
    metadata: EmailMetadata,
  ): Promise<string> {
    try {
      // Render the template
      const htmlContent = this.templateService.renderTemplate(
        notificationType,
        metadata,
      );

      // Prepare email subject based on notification type
      const subject = this.getEmailSubject(notificationType);

      // Send email
      const result = await this.transporter.sendMail({
        from: process.env.MAIL_FROM || 'noreply@fundingplatform.com',
        to: metadata.recipientEmail,
        subject,
        html: htmlContent,
      });

      this.logger.log(
        `Email sent successfully to ${metadata.recipientEmail} (${notificationType})`,
      );
      return result.messageId;
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${metadata.recipientEmail}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Send multiple emails
   */
  async sendBulkEmails(
    notificationType: NotificationType,
    recipients: EmailMetadata[],
  ): Promise<{ successful: string[]; failed: string[] }> {
    const successful: string[] = [];
    const failed: string[] = [];

    for (const metadata of recipients) {
      try {
        await this.sendEmail(notificationType, metadata);
        successful.push(metadata.recipientEmail);
      } catch (error) {
        this.logger.warn(`Failed to send to ${metadata.recipientEmail}`);
        failed.push(metadata.recipientEmail);
      }
    }

    return { successful, failed };
  }

  /**
   * Get email subject based on notification type
   */
  private getEmailSubject(notificationType: NotificationType): string {
    const subjects: { [key in NotificationType]: string } = {
      [NotificationType.ROUND_OPENED]: '🎉 New Funding Round Available',
      [NotificationType.PAYOUT_RECEIVED]: '💰 Your Payout Has Been Processed',
      [NotificationType.PAYMENT_REMINDER]: '⏰ Payment Due Reminder',
    };
    return subjects[notificationType];
  }
}
