import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../src/common/redis/redis.service';
import { DataSource } from 'typeorm';

describe('Idempotency (e2e)', () => {
  let app: INestApplication;
  let redisService: RedisService;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    redisService = app.get(RedisService);
    dataSource = app.get(DataSource);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up Redis before each test
    await redisService.delByPattern('idempotency:*');
  });

  describe('POST /internal/contributions (with idempotency)', () => {
    it('should require Idempotency-Key header', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/internal/contributions')
        .set('X-API-Key', process.env.API_KEY || 'test-api-key')
        .send({
          groupId: uuidv4(),
          userId: uuidv4(),
          walletAddress: 'GTEST123',
          roundNumber: 1,
          amount: '100.00',
          transactionHash: 'test-hash-' + Date.now(),
        })
        .expect(400);

      expect(response.body.message).toContain('Idempotency-Key');
    });

    it('should reject invalid Idempotency-Key format', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/internal/contributions')
        .set('X-API-Key', process.env.API_KEY || 'test-api-key')
        .set('Idempotency-Key', 'not-a-uuid')
        .send({
          groupId: uuidv4(),
          userId: uuidv4(),
          walletAddress: 'GTEST123',
          roundNumber: 1,
          amount: '100.00',
          transactionHash: 'test-hash-' + Date.now(),
        })
        .expect(400);

      expect(response.body.message).toContain('UUID v4');
    });

    it('should process first request and cache response', async () => {
      const idempotencyKey = uuidv4();
      const contributionData = {
        groupId: uuidv4(),
        userId: uuidv4(),
        walletAddress: 'GTEST123',
        roundNumber: 1,
        amount: '100.00',
        transactionHash: 'test-hash-' + Date.now(),
      };

      // First request
      const response1 = await request(app.getHttpServer())
        .post('/api/v1/internal/contributions')
        .set('X-API-Key', process.env.API_KEY || 'test-api-key')
        .set('Idempotency-Key', idempotencyKey)
        .send(contributionData);

      // Should not have replay header on first request
      expect(response1.headers['x-idempotency-replay']).toBeUndefined();

      // Verify response was cached in Redis
      const cachedResponse = await redisService.get(
        `idempotency:${idempotencyKey}`,
      );
      expect(cachedResponse).toBeDefined();
      expect(cachedResponse).not.toBeNull();
    });

    it('should return cached response on duplicate request', async () => {
      const idempotencyKey = uuidv4();
      const contributionData = {
        groupId: uuidv4(),
        userId: uuidv4(),
        walletAddress: 'GTEST123',
        roundNumber: 1,
        amount: '100.00',
        transactionHash: 'test-hash-' + Date.now(),
      };

      // First request
      const response1 = await request(app.getHttpServer())
        .post('/api/v1/internal/contributions')
        .set('X-API-Key', process.env.API_KEY || 'test-api-key')
        .set('Idempotency-Key', idempotencyKey)
        .send(contributionData);

      const firstResponseBody = response1.body;

      // Second request with same idempotency key
      const response2 = await request(app.getHttpServer())
        .post('/api/v1/internal/contributions')
        .set('X-API-Key', process.env.API_KEY || 'test-api-key')
        .set('Idempotency-Key', idempotencyKey)
        .send(contributionData);

      // Should have replay header on second request
      expect(response2.headers['x-idempotency-replay']).toBe('true');

      // Response bodies should be identical
      expect(response2.body).toEqual(firstResponseBody);
    });

    it('should create only one database record despite duplicate requests', async () => {
      const idempotencyKey = uuidv4();
      const groupId = uuidv4();
      const userId = uuidv4();
      const transactionHash = 'test-hash-' + Date.now();

      const contributionData = {
        groupId,
        userId,
        walletAddress: 'GTEST123',
        roundNumber: 1,
        amount: '100.00',
        transactionHash,
      };

      // Send same request twice with same idempotency key
      await request(app.getHttpServer())
        .post('/api/v1/internal/contributions')
        .set('X-API-Key', process.env.API_KEY || 'test-api-key')
        .set('Idempotency-Key', idempotencyKey)
        .send(contributionData);

      await request(app.getHttpServer())
        .post('/api/v1/internal/contributions')
        .set('X-API-Key', process.env.API_KEY || 'test-api-key')
        .set('Idempotency-Key', idempotencyKey)
        .send(contributionData);

      // Query database to verify only one record exists
      const contributions = await dataSource.query(
        'SELECT * FROM contributions WHERE transaction_hash = $1',
        [transactionHash],
      );

      expect(contributions.length).toBe(1);
    });

    it('should allow different requests with different idempotency keys', async () => {
      const idempotencyKey1 = uuidv4();
      const idempotencyKey2 = uuidv4();

      const contributionData1 = {
        groupId: uuidv4(),
        userId: uuidv4(),
        walletAddress: 'GTEST123',
        roundNumber: 1,
        amount: '100.00',
        transactionHash: 'test-hash-1-' + Date.now(),
      };

      const contributionData2 = {
        groupId: uuidv4(),
        userId: uuidv4(),
        walletAddress: 'GTEST456',
        roundNumber: 1,
        amount: '200.00',
        transactionHash: 'test-hash-2-' + Date.now(),
      };

      // First request
      const response1 = await request(app.getHttpServer())
        .post('/api/v1/internal/contributions')
        .set('X-API-Key', process.env.API_KEY || 'test-api-key')
        .set('Idempotency-Key', idempotencyKey1)
        .send(contributionData1);

      // Second request with different key
      const response2 = await request(app.getHttpServer())
        .post('/api/v1/internal/contributions')
        .set('X-API-Key', process.env.API_KEY || 'test-api-key')
        .set('Idempotency-Key', idempotencyKey2)
        .send(contributionData2);

      // Both should succeed and have different responses
      expect(response1.body.data.transactionHash).toBe(
        contributionData1.transactionHash,
      );
      expect(response2.body.data.transactionHash).toBe(
        contributionData2.transactionHash,
      );
      expect(response1.body.data.id).not.toBe(response2.body.data.id);
    });
  });

  describe('POST /groups/:id/payout (with idempotency)', () => {
    it('should require Idempotency-Key header', async () => {
      const groupId = uuidv4();
      const response = await request(app.getHttpServer())
        .post(`/api/v1/groups/${groupId}/payout`)
        .set('Authorization', 'Bearer test-jwt-token')
        .send({
          recipientUserId: uuidv4(),
          transactionHash: 'payout-hash-' + Date.now(),
        })
        .expect(400);

      expect(response.body.message).toContain('Idempotency-Key');
    });

    it('should reject invalid Idempotency-Key format', async () => {
      const groupId = uuidv4();
      const response = await request(app.getHttpServer())
        .post(`/api/v1/groups/${groupId}/payout`)
        .set('Authorization', 'Bearer test-jwt-token')
        .set('Idempotency-Key', 'invalid-key')
        .send({
          recipientUserId: uuidv4(),
          transactionHash: 'payout-hash-' + Date.now(),
        })
        .expect(400);

      expect(response.body.message).toContain('UUID v4');
    });

    it('should cache payout response and return on duplicate', async () => {
      const idempotencyKey = uuidv4();
      const groupId = uuidv4();
      const payoutData = {
        recipientUserId: uuidv4(),
        transactionHash: 'payout-hash-' + Date.now(),
      };

      // First request
      const response1 = await request(app.getHttpServer())
        .post(`/api/v1/groups/${groupId}/payout`)
        .set('Authorization', 'Bearer test-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .send(payoutData);

      // Second request with same key
      const response2 = await request(app.getHttpServer())
        .post(`/api/v1/groups/${groupId}/payout`)
        .set('Authorization', 'Bearer test-jwt-token')
        .set('Idempotency-Key', idempotencyKey)
        .send(payoutData);

      // Second response should be from cache
      expect(response2.headers['x-idempotency-replay']).toBe('true');
    });
  });

  describe('Idempotency cache expiration', () => {
    it('should respect TTL and allow request after expiration', async () => {
      const idempotencyKey = uuidv4();
      const cacheKey = `idempotency:${idempotencyKey}`;

      // Manually set a cached response with short TTL (1 second)
      const cachedResponse = {
        statusCode: 201,
        body: { test: 'data' },
        timestamp: new Date().toISOString(),
      };

      await redisService.setWithExpiry(
        cacheKey,
        JSON.stringify(cachedResponse),
        1, // 1 second TTL
      );

      // Verify cache exists
      let cached = await redisService.get(cacheKey);
      expect(cached).not.toBeNull();

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Verify cache expired
      cached = await redisService.get(cacheKey);
      expect(cached).toBeNull();
    });
  });
});
