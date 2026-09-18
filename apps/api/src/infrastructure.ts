import {
  Inject,
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { CONFIG, type AppConfig } from './config.js';
@Injectable()
export class DatabaseService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(@Inject(CONFIG) config: AppConfig) {
    super({ datasources: { db: { url: config.databaseUrl } } });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
  async ping() {
    await this.$queryRaw`SELECT 1`;
  }
}
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  readonly client: Redis;
  constructor(@Inject(CONFIG) config: AppConfig) {
    this.client = new Redis(config.redisUrl, {
      lazyConnect: true,
      connectTimeout: 3000,
      commandTimeout: 3000,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    this.client.on('error', () => {
      /* Health endpoint reports unavailable without logging credentials. */
    });
  }
  async onModuleInit() {
    await this.client.connect();
  }
  async onModuleDestroy() {
    this.client.disconnect();
  }
  async ping() {
    await this.client.ping();
  }
}
