import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ApiVersionDeprecationInterceptor } from './common/interceptors/api-version-deprecation.interceptor';
import { WinstonLogger } from './common/logger/winston.logger';
import { CustomThrottlerGuard } from './throttler/guards/custom-throttler.guard';
import { RateLimitHeadersInterceptor } from './throttler/interceptors/rate-limit-headers.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new WinstonLogger(),
  });

  // Get Reflector for guards and interceptors
  const reflector = app.get(Reflector);

  // Enable API versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global guards
  app.useGlobalGuards(new CustomThrottlerGuard({ reflector }));

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
    new RateLimitHeadersInterceptor(),
    new ApiVersionDeprecationInterceptor(reflector),
  );

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Setup Swagger documentation
  const isSwaggerEnabled =
    process.env.NODE_ENV !== 'production' ||
    process.env.SWAGGER_ENABLED === 'true';

  if (isSwaggerEnabled) {
    // V1 API Documentation
    const configV1 = new DocumentBuilder()
      .setTitle('Ahjoor Backend API v1')
      .setDescription('Version 1 of the Ahjoor Backend API')
      .setVersion('1.0.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .build();

    const documentV1 = SwaggerModule.createDocument(app, configV1, {
      include: [], // Include all modules for now
      operationIdFactory: (controllerKey: string, methodKey: string) =>
        `${controllerKey}_${methodKey}`,
    });

    SwaggerModule.setup('api/docs/v1', app, documentV1, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    // Main API docs redirect to v1
    SwaggerModule.setup('api/docs', app, documentV1, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    console.log(
      `Swagger documentation available at:\n` +
      `  - v1: http://localhost:${process.env.PORT ?? 3000}/api/docs/v1\n` +
      `  - default: http://localhost:${process.env.PORT ?? 3000}/api/docs`,
    );
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}`);
}
void bootstrap();
