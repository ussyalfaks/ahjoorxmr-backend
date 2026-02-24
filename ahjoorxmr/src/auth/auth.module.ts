import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { TwoFactorService } from './two-factor.service';

@Module({
  controllers: [AuthController],
  providers: [TwoFactorService],
  exports: [TwoFactorService],
})
export class AuthModule {}
