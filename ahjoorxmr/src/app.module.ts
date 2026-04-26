import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MembershipsModule } from './memberships/memberships.module';
import { ContributionsModule } from './contributions/contributions.module';
import { KycModule } from './kyc/kyc.module';
import { Membership } from './memberships/entities/membership.entity';
import { Group } from './groups/entities/group.entity';
import { User } from './users/entities/user.entity';
import { Contribution } from './contributions/entities/contribution.entity';
import { KycDocument } from './kyc/entities/kyc-document.entity';
import { AuditLog } from './kyc/entities/audit-log.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isDevelopment =
          configService.get<string>('NODE_ENV') === 'development';
        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST') || 'localhost',
          port: parseInt(configService.get<string>('DB_PORT') || '5432', 10),
          username: configService.get<string>('DB_USERNAME') || 'postgres',
          password: configService.get<string>('DB_PASSWORD') || 'postgres',
          database: configService.get<string>('DB_NAME') || 'ahjoorxmr',
          entities: [Membership, Group, User, Contribution, KycDocument, AuditLog],
          synchronize: isDevelopment,
          logging: isDevelopment,
        };
      },
      inject: [ConfigService],
    }),
    HealthModule,
    AuthModule,
    UsersModule,
    MembershipsModule,
    ContributionsModule,
    KycModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
