import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { KycDocument } from './entities/kyc-document.entity';
import { AuditLog } from './entities/audit-log.entity';
import { User } from '../users/entities/user.entity';
import { KycWebhookService } from './kyc-webhook.service';
import { KycWebhookController } from './kyc-webhook.controller';
import { KycProviderFactory } from './providers/kyc-provider.factory';
import { WebhookHmacGuard } from './guards/webhook-hmac.guard';
import { NotificationsModule } from '../notification/notifications.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([KycDocument, AuditLog, User]),
    NotificationsModule,
  ],
  controllers: [KycWebhookController],
  providers: [KycWebhookService, KycProviderFactory, WebhookHmacGuard],
  exports: [KycWebhookService],
})
export class KycModule {}
