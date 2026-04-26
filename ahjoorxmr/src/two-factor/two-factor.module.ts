import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { AuditLog } from '../kyc/entities/audit-log.entity';
import { TwoFactorService } from './two-factor.service';
import { TwoFactorController } from './two-factor.controller';
import { NotificationsModule } from '../notification/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, AuditLog]),
    NotificationsModule,
  ],
  controllers: [TwoFactorController],
  providers: [TwoFactorService],
  exports: [TwoFactorService],
})
export class TwoFactorModule {}
