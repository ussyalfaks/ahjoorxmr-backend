import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import * as Handlebars from 'handlebars';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const juice: (html: string) => string = require('juice');
import * as fs from 'fs';
import * as path from 'path';

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  template?: string;
  context?: Record<string, any>;
  html?: string;
  text?: string;
}

export const TEMPLATE_SAMPLE_DATA: Record<string, Record<string, any>> = {
  welcome: {
    userName: 'Jane Doe',
    email: 'jane@example.com',
    activationLink: 'https://example.com/auth/verify-email?token=sample',
  },
  'email-verification': {
    userName: 'Jane Doe',
    verificationLink: 'https://example.com/auth/verify-email?token=sample',
    expiryTime: '24 hours',
  },
  'password-reset': {
    userName: 'Jane Doe',
    resetLink: 'https://example.com/auth/reset-password?token=sample',
    expiryTime: '1 hour',
  },
  '2fa-backup-code-used': {
    userName: 'Jane Doe',
    usedAt: new Date().toISOString(),
    remainingCodes: 7,
  },
  'kyc-approved': { userName: 'Jane Doe' },
  'kyc-declined': {
    userName: 'Jane Doe',
    reason: 'Document image was blurry',
    resubmitLink: 'https://example.com/kyc/resubmit',
  },
  'data-export-ready': {
    userName: 'Jane Doe',
    downloadLink: 'https://example.com/exports/sample.zip',
    expiryTime: '48 hours',
  },
  'payout-received': {
    userName: 'Jane Doe',
    groupName: 'Savings Circle',
    currency: 'XLM',
    amount: '500.00',
    transactionId: 'abc123xyz',
    payoutDate: new Date().toLocaleDateString(),
  },
  'contribution-confirmed': {
    userName: 'Jane Doe',
    groupName: 'Savings Circle',
    currency: 'XLM',
    amount: '100.00',
    roundNumber: 3,
    contributionDate: new Date().toLocaleDateString(),
  },
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly templatesDir = path.join(__dirname, 'templates');

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  compileTemplate(
    templateName: string,
    context: Record<string, any>,
    locale?: string,
  ): string {
    const lang =
      locale ?? this.configService.get<string>('MAIL_LOCALE', 'en');
    const templatePath = path.join(
      this.templatesDir,
      lang,
      `${templateName}.hbs`,
    );

    if (!fs.existsSync(templatePath)) {
      throw new NotFoundException(
        `Email template "${templateName}" not found for locale "${lang}"`,
      );
    }

    const source = fs.readFileSync(templatePath, 'utf8');
    const compiled = Handlebars.compile(source);
    return juice(compiled(context));
  }

  async send(
    templateName: string,
    context: Record<string, any>,
    options: Omit<SendEmailOptions, 'template' | 'context' | 'html'>,
    locale?: string,
  ): Promise<void> {
    const html = this.compileTemplate(templateName, context, locale);
    await this.sendMail({ ...options, html });
  }

  async sendMail(options: SendEmailOptions): Promise<void> {
    try {
      const { to, subject, template, context, html, text } = options;

      this.logger.log(
        `Sending email to ${JSON.stringify(to)} with subject: ${subject}`,
      );

      await this.mailerService.sendMail({
        to,
        subject,
        template: template ? `en/${template}` : undefined,
        context,
        html,
        text,
      });

      this.logger.log(`Email sent successfully to ${JSON.stringify(to)}`);
    } catch (error) {
      this.logger.error(`Failed to send email: ${error.message}`, error.stack);
      throw error;
    }
  }

  async sendWelcomeEmail(email: string, username: string): Promise<void> {
    const activationLink = `${this.configService.get('APP_URL')}/auth/verify-email?token=placeholder`;
    await this.send(
      'welcome',
      { userName: username, email, activationLink },
      { to: email, subject: 'Welcome to Ahjoorxmr!' },
    );
  }

  async sendPasswordResetEmail(
    email: string,
    username: string,
    resetToken: string,
  ): Promise<void> {
    const resetLink = `${this.configService.get('APP_URL')}/auth/reset-password?token=${resetToken}`;
    await this.send(
      'password-reset',
      { userName: username, resetLink, expiryTime: '1 hour' },
      { to: email, subject: 'Password Reset Request' },
    );
  }

  async sendEmailVerification(
    email: string,
    username: string,
    verificationToken: string,
  ): Promise<void> {
    const verificationLink = `${this.configService.get('APP_URL')}/auth/verify-email?token=${verificationToken}`;
    await this.send(
      'email-verification',
      { userName: username, email, verificationLink, expiryTime: '24 hours' },
      { to: email, subject: 'Verify Your Email Address' },
    );
  }

  async sendGroupInvitationEmail(
    email: string,
    username: string,
    groupName: string,
    inviterName: string,
    invitationToken: string,
  ): Promise<void> {
    const acceptLink = `${this.configService.get('APP_URL')}/groups/accept-invitation?token=${invitationToken}`;
    await this.sendMail({
      to: email,
      subject: `You've been invited to join ${groupName}`,
      template: 'group-invitation',
      context: { userName: username, groupName, inviterName, acceptLink },
    });
  }

  async sendNotificationEmail(
    email: string,
    username: string,
    notificationTitle: string,
    notificationBody: string,
    actionLink?: string,
  ): Promise<void> {
    await this.sendMail({
      to: email,
      subject: notificationTitle,
      template: 'notification',
      context: {
        userName: username,
        notificationTitle,
        notificationBody,
        actionLink: actionLink || '#',
      },
    });
  }
}
