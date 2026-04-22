import { Module, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { MailService } from './services/mail.service';
import { TemplateService } from './services/template.service';
import { EmailQueueService } from './services/email-queue.service';
import { MailController } from './controllers/mail.controller';
import { EmailProcessor } from '@/bullmq/email.processor';

@Module({
  controllers: [MailController],
  providers: [MailService, TemplateService, EmailQueueService],
  exports: [MailService, TemplateService, EmailQueueService],
})
export class MailModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailModule.name);
  private emailProcessor: EmailProcessor;

  constructor(
    private readonly mailService: MailService,
    private readonly emailQueueService: EmailQueueService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Initialize email processor for job queue only in non-production or if explicitly enabled
    if (process.env.ENABLE_EMAIL_PROCESSOR !== 'false') {
      this.emailProcessor = new EmailProcessor(this.mailService);
      this.logger.log('Email processor started');
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.emailProcessor) {
      await this.emailProcessor.close();
      this.logger.log('Email processor closed');
    }
    await this.emailQueueService.close();
  }
}
