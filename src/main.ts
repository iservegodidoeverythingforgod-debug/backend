import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import helmet from 'helmet';
import * as express from 'express';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security Headers via Helmet
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false, // Allows Swagger UI documentation assets
    }),
  );

  // Body parser limits for large animation payloads
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Cookie Parser Middleware
  app.use((req: any, res: any, next: any) => {
    req.cookies = req.cookies || {};
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      cookieHeader.split(';').forEach((cookie: string) => {
        const parts = cookie.split('=');
        const name = parts[0]?.trim();
        const value = parts.slice(1).join('=').trim();
        if (name && value) {
          req.cookies[name] = decodeURIComponent(value);
        }
      });
    }
    next();
  });

  // Global Prefix
  app.setGlobalPrefix('api');

  // Global Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global Exception Filter
  app.useGlobalFilters(new AllExceptionsFilter());

  // CORS Configuration
  const configuredCorsOrigin = process.env.CORS_ORIGIN;

  app.enableCors({
    origin: configuredCorsOrigin,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization, Cookie',
    exposedHeaders: 'Set-Cookie',
  });

  // Swagger Documentation Setup (enabled in non-production or when explicitly requested)
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Online Seed & Herb Store API')
      .setDescription(
        'RESTful API for Seed & Herb Marketplace featuring Rule-based Plant Growth State Machine, JWT Token Rotation, and QR Payment Slip Verification.',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .addTag('System Health & Monitoring')
      .addTag('Authentication & Profile')
      .addTag('Seeds & Herbs Products')
      .addTag('Categories')
      .addTag('Plant Growth Simulation Engine (Rule-based State Machine)')
      .addTag('Orders')
      .addTag('Payments & QR Slip Verification')
      .addTag('Product Reviews & User Satisfaction')
      .addTag('Admin User Management')
      .addTag('Admin Analytics & Satisfaction Reports')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
}

bootstrap();
