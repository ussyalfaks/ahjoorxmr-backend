import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './common/redis/redis.module';
import { CacheInterceptor } from './common/interceptors/cache.interceptor';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { MembershipsModule } from './memberships/memberships.module';
import { ContributionsModule } from './contributions/contributions.module';
import { Membership } from './memberships/entities/membership.entity';
import { Group } from './groups/entities/group.entity';
import { User } from './users/entities/user.entity';
import { Contribution } from './contributions/entities/contribution.entity';

@Module({
  imports: [
    // TypeORM configuration with SQLite for development
    // For production, replace with PostgreSQL configuration using environment variables
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: ':memory:', // In-memory database for development
      entities: [Membership, Group, User, Contribution],
      synchronize: true, // Auto-create tables (disable in production)
      logging: false,
    }),
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
          entities: [Membership, Group, User],
          synchronize: isDevelopment, // Auto-create tables only in development
          logging: isDevelopment, // Enable logging only in development
        };
      },
      inject: [ConfigService],
    }),
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    MembershipsModule,
    ContributionsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
  ],
})
export class AppModule {}
