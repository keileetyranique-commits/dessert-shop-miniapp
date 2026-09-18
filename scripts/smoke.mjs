import assert from 'node:assert/strict';
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
