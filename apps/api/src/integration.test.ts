import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { parseConfig } from './config.js';
import { createApp } from './app.js';
test('real database tenant constraints, Redis and HTTP readiness', async () => {
  const config = parseConfig(process.env);
  assert.equal(
    config.environment,
    'test',
    'integration suite requires isolated APP_ENV=test',
  );
  assert.match(
    new URL(config.databaseUrl).pathname,
    /test/,
    'database name must include test',
  );
  assert.equal(config.testMode, true);
  const db = new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
  });
  const redis = new Redis(config.redisUrl);
  const ids = [randomUUID(), randomUUID()];
  const key = 'integration:' + randomUUID();
  let app;
  try {
    await db.merchant.createMany({
      data: ids.map((id) => ({ id, name: 'Integration merchant' })),
    });
    const brand = await db.brand.create({
      data: { merchantId: ids[0]!, name: 'Integration brand' },
    });
    await assert.rejects(
      db.store.create({
        data: {
          merchantId: ids[1]!,
          brandId: brand.id,
          name: 'Invalid tenant',
        },
      }),
    );
    const store = await db.store.create({
      data: { merchantId: ids[0]!, brandId: brand.id, name: 'General store' },
    });
    assert.equal(await db.store.count({ where: { merchantId: ids[1]! } }), 0);
    assert.equal(
      (
        await db.store.findUniqueOrThrow({
          where: {
            merchantId_brandId_id: {
              merchantId: ids[0]!,
              brandId: brand.id,
              id: store.id,
            },
          },
        })
      ).id,
      store.id,
    );
    await redis.set(key, 'ok', 'EX', 30);
    assert.equal(await redis.get(key), 'ok');
    app = await createApp(config);
    await app.listen(0, '127.0.0.1');
    assert.equal(
      (await fetch((await app.getUrl()) + '/api/v1/health/ready')).status,
      200,
    );
  } finally {
    if (app) await app.close();
    await redis.del(key);
    redis.disconnect();
    await db.store.deleteMany({ where: { merchantId: { in: ids } } });
    await db.brand.deleteMany({ where: { merchantId: { in: ids } } });
    await db.merchant.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  }
});
