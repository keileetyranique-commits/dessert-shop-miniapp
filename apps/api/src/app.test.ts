import 'reflect-metadata';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.js';
import { DatabaseService, RedisService } from './infrastructure.js';
import { parseConfig } from './config.js';
test('HTTP liveness, readiness, runtime and absent mock routes', async () => {
  let failed = false;
  const config = parseConfig({
    DATABASE_URL: 'postgresql://localhost/unit_test',
    REDIS_URL: 'redis://localhost/1',
    APP_ENV: 'test',
    TEST_MODE: 'false',
  });
  const module = await Test.createTestingModule({
    imports: [AppModule.register(config)],
  })
    .overrideProvider(DatabaseService)
    .useValue({
      ping: async () => {
        if (failed) throw new Error('secret');
      },
    })
    .overrideProvider(RedisService)
    .useValue({ ping: async () => {} })
    .compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');
  try {
    const base = await app.getUrl();
    assert.equal((await fetch(base + '/api/v1/health/live')).status, 200);
    assert.equal((await fetch(base + '/api/v1/health/ready')).status, 200);
    const runtime = await (await fetch(base + '/api/v1/runtime')).json();
    assert.equal(runtime.testMode, false);
    assert.equal(JSON.stringify(runtime).includes('postgres'), false);
    assert.equal(
      (await fetch(base + '/api/v1/admin/test/orders', { method: 'POST' }))
        .status,
      404,
    );
    failed = true;
    const result = await fetch(base + '/api/v1/health/ready');
    assert.equal(result.status, 503);
    assert.equal((await result.text()).includes('secret'), false);
  } finally {
    await app.close();
  }
});
