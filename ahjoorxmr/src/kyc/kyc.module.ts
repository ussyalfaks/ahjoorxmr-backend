import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { KycDocument } from './entities/kyc-document.entity';
import { KycService } from './kyc.service';
import { KycController } from './kyc.controller';
import { User } from '../users/entities/user.entity';
import { NotificationsModule } from '../notification/notifications.module';
import { WinstonLogger } from '../common/logger/winston.logger';

@Module({
  imports: [
    TypeOrmModule.forFeature([KycDocument, User]),
    NotificationsModule,
    ConfigModule,
  ],
  controllers: [KycController],
  providers: [KycService, WinstonLogger],
  exports: [KycService],
})
export class KycModule {}
