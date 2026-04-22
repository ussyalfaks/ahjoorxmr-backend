import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppDataSource } from './database/data-source';
import { AuditModule } from './audit/audit.module';
import { GroupsModule } from './groups/groups.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'audit_db',
      entities: ['dist/**/*.entity{.ts,.js}'],
      synchronize: false,
      logging: false,
      migrations: ['dist/migrations/**/*{.ts,.js}'],
      migrationsRun: true,
    }),
    AuditModule,
    GroupsModule,
  ],
})
export class AppModule {}
