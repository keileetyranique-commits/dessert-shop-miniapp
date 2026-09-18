import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
for (const port of [3000, 5173, 5174]) {
  const path = port === 3000 ? '/api/v1/health/ready' : '/';
  const response = await fetch('http://127.0.0.1:' + port + path, {
    signal: AbortSignal.timeout(10000),
  });
  assert.equal(response.status, 200);
}
for (const port of [5173, 5174]) {
  const response = await fetch('http://127.0.0.1:' + port + '/api/v1/runtime');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).testMode, true);
}
console.log('Compose API/Admin/POS smoke passed');
const identities = JSON.parse(
  parseEnv(readFileSync('.env', 'utf8')).ADMIN_IDENTITIES ?? '[]',
);
assert.ok(identities.length > 0, 'Development owner must be configured');
const anonymous = await fetch('http://127.0.0.1:3000/api/v1/admin/stores');
assert.equal(anonymous.status, 401);
const authenticated = await fetch(
  'http://127.0.0.1:3000/api/v1/admin/session',
  { headers: { Authorization: 'Bearer ' + identities[0].token } },
);
assert.equal(authenticated.status, 200);
assert.equal((await authenticated.json()).role, 'OWNER');
console.log('Compose authenticated admin smoke passed');
