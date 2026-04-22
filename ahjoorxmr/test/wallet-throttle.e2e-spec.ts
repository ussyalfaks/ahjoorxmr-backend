import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  HttpStatus,
  Controller,
  Post,
  UseGuards,
  Request,
  HttpCode,
  Injectable,
} from '@nestjs/common';
import request from 'supertest';
import { ThrottlerModule, Throttle } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { WalletThrottlerGuard } from '../src/throttler/guards/wallet-throttler.guard';
import { TrustedIpService } from '../src/throttler/services/trusted-ip.service';

// Mock Auth Guard to simulate a logged-in user with a wallet
@Injectable()
class MockJwtAuthGuard {
  canActivate(context: any) {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      const walletAddress = auth.split(' ')[1];
      req.user = { walletAddress, id: 'test-user-id' };
    }
    return true;
  }
}

// Test Controller using the REAL guard from src
@Controller('test')
export class TestController {
  @Post('contribution')
  @UseGuards(MockJwtAuthGuard, WalletThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // Matches real implementation
  @HttpCode(HttpStatus.OK)
  async testContribution() {
    return { success: true };
  }

  @Post('activation')
  @UseGuards(MockJwtAuthGuard, WalletThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } }) // Matches real implementation
  @HttpCode(HttpStatus.OK)
  async testActivation() {
    return { success: true };
  }
}

describe('Wallet Throttling (Integration with src Logic)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [
            {
              name: 'default',
              ttl: 60000,
              limit: 100, // Large default, overridden by @Throttle
            },
          ],
        }),
      ],
      controllers: [TestController],
      providers: [
        WalletThrottlerGuard,
        {
          provide: TrustedIpService,
          useValue: {
            isIpTrusted: jest.fn().mockResolvedValue(false),
            isIpBlocked: jest.fn().mockResolvedValue({ blocked: false }),
            incrementViolations: jest
              .fn()
              .mockResolvedValue({ count: 0, shouldBlock: false }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(''),
          },
        },
        Reflector,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  const wallet1 = 'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON';
  const wallet2 = 'GCEZWKCA5LKEBFTC6SVKBYOOCZEL4PBWD2S6N7D57TCHH7CGSG6RYBOC';

  it('should allow up to 5 requests for wallet1 on contribution', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/test/contribution')
        .set('Authorization', `Bearer ${wallet1}`)
        .expect(HttpStatus.OK);
    }
  });

  it('should throttle the 6th contribution request for wallet1', async () => {
    const res = await request(app.getHttpServer())
      .post('/test/contribution')
      .set('Authorization', `Bearer ${wallet1}`)
      .expect(HttpStatus.TOO_MANY_REQUESTS);

    expect(res.headers).toHaveProperty('retry-after');
  });

  it('should still allow wallet2 to make a contribution request', async () => {
    await request(app.getHttpServer())
      .post('/test/contribution')
      .set('Authorization', `Bearer ${wallet2}`)
      .expect(HttpStatus.OK);
  });

  it('should throttle wallet2 after 3 requests on activation', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer())
        .post('/test/activation')
        .set('Authorization', `Bearer ${wallet2}`)
        .expect(HttpStatus.OK);
    }

    await request(app.getHttpServer())
      .post('/test/activation')
      .set('Authorization', `Bearer ${wallet2}`)
      .expect(HttpStatus.TOO_MANY_REQUESTS);
  });
});
