import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fen, addFen, formatFen, tenantScope } from './index.js';
test('money rejects fractions, unsafe integers and overflow', () => {
  for (const value of [0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => fen(value));
  assert.equal(addFen(fen(10), fen(20)), 30);
  assert.throws(() => addFen(fen(Number.MAX_SAFE_INTEGER), fen(1)));
  assert.equal(formatFen(fen(-123)), '-1.23');
  assert.equal(formatFen(fen(1)), '0.01');
});
test('tenant scope is explicit and rejects missing identifiers', () => {
  assert.deepEqual(tenantScope('m', 'b', 's'), {
    merchantId: 'm',
    brandId: 'b',
    storeId: 's',
  });
  assert.throws(() => tenantScope('', 'b', 's'));
});
