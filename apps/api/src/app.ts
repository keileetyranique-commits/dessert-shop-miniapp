import 'reflect-metadata';
import {
  Controller,
  Get,
  Inject,
  Module,
  ServiceUnavailableException,
  type DynamicModule,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { RuntimeInfo } from '@platform/shared';
import { CONFIG, type AppConfig } from './config.js';
import { DatabaseService, RedisService } from './infrastructure.js';
@Controller()
export class AppController {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}
  @Get('health/live') live() {
    return { status: 'ok' };
  }
  @Get('health/ready') async ready() {
    try {
      await Promise.all([this.db.ping(), this.redis.ping()]);
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Dependencies unavailable');
    }
  }
  @Get('runtime') runtime(): RuntimeInfo {
    return {
      service: 'store-platform-api',
      environment: this.config.environment,
      testMode: this.config.testMode,
      schemaVersion: 1,
    };
  }
}
@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [AppController],
      providers: [
        { provide: CONFIG, useValue: config },
        DatabaseService,
        RedisService,
      ],
    };
  }
}
export async function createApp(config: AppConfig) {
  const app = await NestFactory.create(AppModule.register(config), {
    abortOnError: false,
  });
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: config.corsOrigins });
  app.enableShutdownHooks();
  return app;
}
