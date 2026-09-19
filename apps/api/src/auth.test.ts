import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  parseIdentities,
  authenticate,
  authorizeStore,
  requireCostRole,
} from './identity.js';
const token = randomBytes(32).toString('hex');
const identity = {
  id: 'owner-a',
  token,
  merchantId: randomUUID(),
  brandId: randomUUID(),
  storeIds: [randomUUID()],
  role: 'OWNER' as const,
};
test('verified identity only: missing, wrong and development headers cannot authenticate', () => {
  const identities = parseIdentities(JSON.stringify([identity]));
  assert.throws(() => authenticate(undefined, identities));
  assert.throws(() => authenticate('Bearer invalid', identities));
  assert.equal(
    authenticate('Bearer ' + token, identities).merchantId,
    identity.merchantId,
  );
  assert.throws(() =>
    parseIdentities(JSON.stringify([{ ...identity, token: 'short' }])),
  );
  assert.throws(() =>
    parseIdentities(JSON.stringify([{ ...identity, role: 'UNKNOWN' }])),
  );
});
test('store and sensitive cost authorizations fail closed', () => {
  authorizeStore(identity, identity.storeIds[0]!);
  assert.throws(() => authorizeStore(identity, randomUUID()));
  assert.throws(() => requireCostRole({ ...identity, role: 'MANAGER' }));
  requireCostRole({ ...identity, role: 'COST_MANAGER' });
});
