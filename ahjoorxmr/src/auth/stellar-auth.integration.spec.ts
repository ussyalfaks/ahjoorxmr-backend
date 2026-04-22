import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import * as request from 'supertest';
import * as StellarSdk from '@stellar/stellar-sdk';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { StellarModule } from '../stellar/stellar.module';
import { AuthModule } from './auth.module';
import { User } from '../users/entities/user.entity';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('Auth - Stellar Wallet Flow (Integration)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let usersService: UsersService;

  const keypair = StellarSdk.Keypair.random();
  const walletAddress = keypair.publicKey();
  const challenge = 'Sign this message to authenticate';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue({
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
        update: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);
    usersService = moduleFixture.get<UsersService>(UsersService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /auth/wallet/register', () => {
    it('should register a new user with a valid signature', async () => {
      const signature = keypair.sign(Buffer.from(challenge)).toString('base64');

      jest.spyOn(usersService, 'findByWalletAddress').mockResolvedValue(null);
      jest.spyOn(usersService, 'create').mockResolvedValue({
        id: 'user-uuid',
        walletAddress,
        role: 'user',
        email: null,
      } as User);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/wallet/register')
        .send({
          walletAddress,
          signature,
          challenge,
        })
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
    });

    it('should return 401 for an invalid signature', async () => {
      const invalidSignature = 'invalid-signature';

      await request(app.getHttpServer())
        .post('/api/v1/auth/wallet/register')
        .send({
          walletAddress,
          signature: invalidSignature,
          challenge,
        })
        .expect(401);
    });

    it('should login an existing user with a valid signature', async () => {
      const signature = keypair.sign(Buffer.from(challenge)).toString('base64');
      const existingUser = {
        id: 'existing-uuid',
        walletAddress,
        role: 'user',
        email: 'test@example.com',
      } as User;

      jest
        .spyOn(usersService, 'findByWalletAddress')
        .mockResolvedValue(existingUser);

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/wallet/register')
        .send({
          walletAddress,
          signature,
          challenge,
        })
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
    });
  });
});
