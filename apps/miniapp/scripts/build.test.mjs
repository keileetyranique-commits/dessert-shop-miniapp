import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicConfig } from './config.mjs';
test('client build exposes only public config', () => {
  const config = publicConfig({
    WECHAT_APP_SECRET: 'do-not-expose',
    WECHAT_APP_ID: 'wxexample',
  });
  assert.equal(JSON.stringify(config).includes('do-not-expose'), false);
  assert.equal(config.appid, 'wxexample');
});
test('production requires real app id and secure endpoint', () => {
  assert.throws(() => publicConfig({ APP_ENV: 'production' }));
  assert.throws(() => publicConfig({ NODE_ENV: 'production' }));
  assert.throws(() =>
    publicConfig({
      APP_ENV: 'production',
      WECHAT_APP_ID: 'wxid',
      MINIAPP_API_BASE_URL: 'http://localhost/api/v1',
    }),
  );
  assert.throws(() =>
    publicConfig({ MINIAPP_API_BASE_URL: 'https://user:pass@example.com/api' }),
  );
  assert.equal(
    publicConfig({
      APP_ENV: 'production',
      WECHAT_APP_ID: 'wxid',
      MINIAPP_API_BASE_URL: 'https://example.com/api/v1',
    }).appid,
    'wxid',
  );
});
