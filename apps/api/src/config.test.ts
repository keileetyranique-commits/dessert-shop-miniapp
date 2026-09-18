import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseConfig } from './config.js';
const base = {
  DATABASE_URL: 'postgresql://localhost/platform_test',
  REDIS_URL: 'redis://localhost/1',
  APP_ENV: 'test',
  TEST_MODE: 'true',
};
test('config fails closed for invalid and production test modes', () => {
  assert.equal(parseConfig(base).testMode, true);
  assert.throws(() => parseConfig({ ...base, APP_ENV: 'production' }));
  assert.throws(() => parseConfig({ ...base, NODE_ENV: 'production' }));
  assert.throws(() => parseConfig({ ...base, TEST_MODE: 'yes' }));
  assert.throws(() => parseConfig({ ...base, DATABASE_URL: '' }));
  assert.throws(() => parseConfig({ ...base, API_PORT: '3.2' }));
  assert.throws(() =>
    parseConfig({ ...base, REDIS_URL: 'https://example.com' }),
  );
  assert.equal(
    parseConfig({ ...base, APP_ENV: 'production', TEST_MODE: 'false' })
      .testMode,
    false,
  );
});
