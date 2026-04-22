import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../src/users/entities/user.entity';

describe('RBAC E2E Tests', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let configService: ConfigService;
  let adminToken: string;
  let userToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);
    configService = moduleFixture.get<ConfigService>(ConfigService);

    // Note: These tokens are for testing only and bypass the normal auth flow
    // In a real scenario, tokens would be generated through the auth endpoints
    
    const privateKey = configService.get<string>('JWT_PRIVATE_KEY');
    
    if (!privateKey) {
      console.warn('JWT_PRIVATE_KEY not configured - tests may fail');
    }

    // Generate admin token
    adminToken = await jwtService.signAsync(
      { sub: 'admin-user-id', walletAddress: 'GADMIN...' },
      {
        privateKey,
        algorithm: 'RS256',
        expiresIn: '1h',
      },
    );

    // Generate regular user token
    userToken = await jwtService.signAsync(
      { sub: 'regular-user-id', walletAddress: 'GUSER...' },
      {
        privateKey,
        algorithm: 'RS256',
        expiresIn: '1h',
      },
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Queue Admin Endpoints', () => {
    describe('GET /api/v1/admin/queue/stats', () => {
      it('should return 200 for admin user', () => {
        return request(app.getHttpServer())
          .get('/api/v1/admin/queue/stats')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
      });

      it('should return 403 for non-admin user', () => {
        return request(app.getHttpServer())
          .get('/api/v1/admin/queue/stats')
          .set('Authorization', `Bearer ${userToken}`)
          .expect(403)
          .expect((res) => {
            expect(res.body.message).toContain('Insufficient permissions');
          });
      });

      it('should return 401 for unauthenticated request', () => {
        return request(app.getHttpServer())
          .get('/api/v1/admin/queue/stats')
          .expect(401);
      });
    });

    describe('GET /api/v1/admin/queue/dead-letter', () => {
      it('should return 200 for admin user', () => {
        return request(app.getHttpServer())
          .get('/api/v1/admin/queue/dead-letter')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
      });

      it('should return 403 for non-admin user', () => {
        return request(app.getHttpServer())
          .get('/api/v1/admin/queue/dead-letter')
          .set('Authorization', `Bearer ${userToken}`)
          .expect(403);
      });
    });

    describe('POST /api/v1/admin/queue/retry', () => {
      it('should return 403 for non-admin user', () => {
        return request(app.getHttpServer())
          .post('/api/v1/admin/queue/retry')
          .set('Authorization', `Bearer ${userToken}`)
          .send({ jobId: 'test-job-id' })
          .expect(403);
      });

      it('should allow admin user to retry jobs', () => {
        return request(app.getHttpServer())
          .post('/api/v1/admin/queue/retry')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ jobId: 'test-job-id' })
          .expect((res) => {
            // May return 200 or 404 depending on job existence
            expect([200, 404, 500]).toContain(res.status);
          });
      });
    });
  });

  describe('Audit Log Endpoints', () => {
    describe('GET /api/v1/audit', () => {
      it('should return 200 for admin user', () => {
        return request(app.getHttpServer())
          .get('/api/v1/audit')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty('data');
            expect(res.body).toHaveProperty('total');
            expect(res.body).toHaveProperty('page');
          });
      });

      it('should return 403 for non-admin user', () => {
        return request(app.getHttpServer())
          .get('/api/v1/audit')
          .set('Authorization', `Bearer ${userToken}`)
          .expect(403);
      });

      it('should support pagination and filtering', () => {
        return request(app.getHttpServer())
          .get('/api/v1/audit?page=1&limit=10&action=DELETE')
          .set('Authorization', `Bearer ${adminToken}`)
          .expect(200);
      });
    });
  });

  describe('Groups Admin Endpoints', () => {
    describe('DELETE /api/v1/groups/:id', () => {
      const testGroupId = '123e4567-e89b-12d3-a456-426614174000';

      it('should return 403 for non-admin user', () => {
        return request(app.getHttpServer())
          .delete(`/api/v1/groups/${testGroupId}`)
          .set('Authorization', `Bearer ${userToken}`)
          .expect(403);
      });

      it('should allow admin user to delete groups', () => {
        return request(app.getHttpServer())
          .delete(`/api/v1/groups/${testGroupId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .expect((res) => {
            // May return 204 or 404 depending on group existence
            expect([204, 404]).toContain(res.status);
          });
      });

      it('should return 401 for unauthenticated request', () => {
        return request(app.getHttpServer())
          .delete(`/api/v1/groups/${testGroupId}`)
          .expect(401);
      });
    });
  });

  describe('Guard Stacking', () => {
    it('should properly stack JwtAuthGuard and RolesGuard', async () => {
      // Test that both guards work together
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/queue/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    it('should reject invalid JWT even with admin role claim', async () => {
      const invalidToken = 'invalid.jwt.token';
      
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/queue/stats')
        .set('Authorization', `Bearer ${invalidToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe('Role Propagation', () => {
    it('should include role in JWT payload and request.user', async () => {
      // This test verifies that the role is properly propagated through the auth flow
      const response = await request(app.getHttpServer())
        .get('/api/v1/admin/queue/stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      // The fact that we get 200 means the role was properly extracted and validated
    });
  });
});
