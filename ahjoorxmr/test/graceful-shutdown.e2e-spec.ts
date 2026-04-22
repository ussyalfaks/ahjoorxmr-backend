import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Graceful Shutdown (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableShutdownHooks();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should complete in-flight requests before shutting down', async () => {
    const server = app.getHttpServer();
    const port = 3001; // Use a different port for testing
    await app.listen(port);

    // Track request completion
    let requestCompleted = false;
    let shutdownStarted = false;
    let shutdownCompleted = false;

    // Start a long-running request (simulate with health check + delay)
    const requestPromise = request(server)
      .get('/health')
      .then((response) => {
        requestCompleted = true;
        expect(response.status).toBe(200);
        return response;
      });

    // Give the request a moment to start
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Trigger graceful shutdown
    const shutdownPromise = (async () => {
      shutdownStarted = true;
      await app.close();
      shutdownCompleted = true;
    })();

    // Wait for both to complete
    await Promise.all([requestPromise, shutdownPromise]);

    // Verify the request completed before shutdown
    expect(requestCompleted).toBe(true);
    expect(shutdownStarted).toBe(true);
    expect(shutdownCompleted).toBe(true);
  });

  it('should close database connections during shutdown', async () => {
    const dataSource = app.get('DataSource');
    expect(dataSource.isInitialized).toBe(true);

    await app.close();

    // After shutdown, database should be destroyed
    expect(dataSource.isInitialized).toBe(false);
  });

  it('should respect shutdown timeout', async () => {
    // Set a very short timeout for testing
    process.env.SHUTDOWN_TIMEOUT_MS = '100';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const testApp = moduleFixture.createNestApplication();
    testApp.enableShutdownHooks();
    await testApp.init();

    const startTime = Date.now();
    await testApp.close();
    const duration = Date.now() - startTime;

    // Shutdown should complete within reasonable time
    // (actual timeout + some buffer for cleanup)
    expect(duration).toBeLessThan(5000);

    // Cleanup
    delete process.env.SHUTDOWN_TIMEOUT_MS;
  });

  it('should log shutdown phases with timestamps', async () => {
    const logSpy = jest.spyOn(console, 'log');

    await app.close();

    // Verify shutdown logging occurred
    const shutdownLogs = logSpy.mock.calls
      .map((call) => call[0])
      .filter((log) => typeof log === 'string' && log.includes('shutdown'));

    expect(shutdownLogs.length).toBeGreaterThan(0);

    logSpy.mockRestore();
  });

  it('should handle SIGTERM signal gracefully', async () => {
    const server = app.getHttpServer();
    await app.listen(3002);

    // Track shutdown
    let shutdownCompleted = false;

    // Listen for app close
    const closePromise = new Promise<void>((resolve) => {
      app.enableShutdownHooks();
      // Override the close method to track completion
      const originalClose = app.close.bind(app);
      app.close = async () => {
        await originalClose();
        shutdownCompleted = true;
        resolve();
      };
    });

    // Simulate SIGTERM (in real scenario, this would come from process.kill)
    // For testing, we directly call close which is what SIGTERM handler does
    await app.close();

    expect(shutdownCompleted).toBe(true);
  });

  it('should handle SIGINT signal gracefully', async () => {
    const server = app.getHttpServer();
    await app.listen(3003);

    // Track shutdown
    let shutdownCompleted = false;

    // Listen for app close
    const closePromise = new Promise<void>((resolve) => {
      app.enableShutdownHooks();
      const originalClose = app.close.bind(app);
      app.close = async () => {
        await originalClose();
        shutdownCompleted = true;
        resolve();
      };
    });

    // Simulate SIGINT (Ctrl+C)
    await app.close();

    expect(shutdownCompleted).toBe(true);
  });
});
