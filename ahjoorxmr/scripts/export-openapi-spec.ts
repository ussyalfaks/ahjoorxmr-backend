import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import * as fs from 'fs';
import * as path from 'path';

async function exportOpenApiSpec() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('Ahjoor Backend API')
    .setDescription('A comprehensive backend API for the Ahjoor application')
    .setVersion('0.0.1')
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

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => 
      `${controllerKey}_${methodKey}`,
  });

  const outputPath = path.resolve(process.cwd(), 'openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));

  console.log(`OpenAPI specification exported to: ${outputPath}`);
  console.log(`API Title: ${document.info.title}`);
  console.log(`API Version: ${document.info.version}`);
  
  await app.close();
  process.exit(0);
}

exportOpenApiSpec().catch((error) => {
  console.error('Failed to export OpenAPI specification:', error);
  process.exit(1);
});