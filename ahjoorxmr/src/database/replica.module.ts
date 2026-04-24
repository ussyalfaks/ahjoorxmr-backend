import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService, ConfigModule } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { asyncLocalStorage } from '../common/context/async-context';
import { REPLICA_CONNECTION_NAME } from './database.constants';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      name: REPLICA_CONNECTION_NAME,
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const primaryHost = configService.get<string>('DB_HOST') || 'localhost';
        const primaryPort = parseInt(configService.get<string>('DB_PORT') || '5432', 10);
        
        const replicaHost = configService.get<string>('DB_READ_HOST');
        const replicaPort = parseInt(configService.get<string>('DB_READ_PORT') || primaryPort.toString(), 10);

        // Fallback to primary if replica host is not set
        if (!replicaHost) {
          return {
            type: 'postgres',
            host: primaryHost,
            port: primaryPort,
            username: configService.get<string>('DB_USERNAME') || 'postgres',
            password: configService.get<string>('DB_PASSWORD') || 'postgres',
            database: configService.get<string>('DB_NAME') || 'ahjoorxmr',
            autoLoadEntities: true,
            synchronize: false,
          };
        }

        return {
          type: 'postgres',
          host: replicaHost,
          port: replicaPort,
          username: configService.get<string>('DB_READ_USERNAME') || configService.get<string>('DB_USERNAME') || 'postgres',
          password: configService.get<string>('DB_READ_PASSWORD') || configService.get<string>('DB_PASSWORD') || 'postgres',
          database: configService.get<string>('DB_READ_NAME') || configService.get<string>('DB_NAME') || 'ahjoorxmr',
          autoLoadEntities: true,
          synchronize: false,
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [],
  exports: [TypeOrmModule],
})
export class ReplicaModule {}
