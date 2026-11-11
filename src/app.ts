import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { AdminAuth } from './auth/admin-auth';
import { AdminGuard } from './auth/admin-guard';
import { Backend } from './backend/backend';
import { APP_CONFIG, type AppConfig } from './config';
import {
  AdminApiController,
  AdminController,
  AdminSignInController,
} from './controllers/admin.controller';
import { PublicController } from './controllers/public.controller';
import { ErrorFilter } from './http/error-filter';
import { sameOriginOnly, securityHeaders } from './http/security';

@Module({})
class AppModule {
  static with(backend: Backend, config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        PublicController,
        AdminSignInController,
        AdminController,
        AdminApiController,
      ],
      providers: [
        { provide: Backend, useValue: backend },
        { provide: APP_CONFIG, useValue: config },
        { provide: APP_FILTER, useClass: ErrorFilter },
        AdminAuth,
        AdminGuard,
      ],
    };
  }
}

/** Builds the Nest app without listening; the worker and tests both use this. */
export async function createApp(
  backend: Backend,
  config: AppConfig
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.with(backend, config),
    {
      bodyParser: false,
      logger: ['error', 'warn'],
    }
  );
  app.disable('x-powered-by');
  app.set('etag', false);
  app.use(securityHeaders);
  app.use(sameOriginOnly);
  app.use(
    express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 400 })
  );
  app.use(express.json({ limit: '512kb' }));
  return app;
}
