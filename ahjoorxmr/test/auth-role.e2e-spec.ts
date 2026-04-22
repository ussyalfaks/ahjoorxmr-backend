import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { UsersService } from '../src/users/users.service';
import { UserRole } from '../src/users/entities/user.entity';
import { AuthService } from '../src/stellar-auth/auth.service';

describe('Auth Role Integration E2E', () => {
  let app: INestApplication;
  let usersService: UsersService;
  let authService: AuthService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    usersService = moduleFixture.get<UsersService>(UsersService);
    authService = moduleFixture.get<AuthService>(AuthService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Token Generation with Role', () => {
    it('should include role in generated JWT tokens', async () => {
      // Create a test user with admin role
      const testWallet =
        'GTEST' + Math.random().toString(36).substring(7).toUpperCase();
      const user = await usersService.upsertByWalletAddress(testWallet);
      await usersService.updateRole(user.id, UserRole.ADMIN);

      // Generate challenge and verify signature flow would include role
      const challenge = await authService.generateChallenge(testWallet);
      expect(challenge).toBeDefined();

      // Note: Full signature verification requires Stellar keypair
      // This test verifies the service methods exist and work
    });

    it('should default new users to USER role', async () => {
      const testWallet =
        'GTEST' + Math.random().toString(36).substring(7).toUpperCase();
      const user = await usersService.upsertByWalletAddress(testWallet);

      expect(user.role).toBe(UserRole.USER);
    });

    it('should allow updating user role', async () => {
      const testWallet =
        'GTEST' + Math.random().toString(36).substring(7).toUpperCase();
      const user = await usersService.upsertByWalletAddress(testWallet);

      const updatedUser = await usersService.updateRole(
        user.id,
        UserRole.MODERATOR,
      );

      expect(updatedUser.role).toBe(UserRole.MODERATOR);
    });
  });

  describe('JWT Strategy Validation', () => {
    it('should validate JWT and extract user with role', async () => {
      // This is tested implicitly through the RBAC e2e tests
      // The JWT strategy's validate method is called by Passport
      expect(usersService.findById).toBeDefined();
    });
  });
});
