import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiKey } from './entities/api-key.entity';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyAuthGuard } from './guards/api-key-auth.guard';
import { KeyScopeGuard } from './guards/key-scope.guard';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey]), AuditModule],
  providers: [ApiKeysService, ApiKeyAuthGuard, KeyScopeGuard],
  exports: [ApiKeysService, ApiKeyAuthGuard, KeyScopeGuard],
})
export class ApiKeysModule {}
