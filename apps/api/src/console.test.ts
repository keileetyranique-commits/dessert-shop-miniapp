import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CatalogController } from './catalog.controller.js';
import type { DatabaseService } from './infrastructure.js';
import type { AdminRequest } from './auth.js';
test('分类归档拒绝仍有关联商品的分类，并传递完整租户范围', async () => {
  const scope = {
    storeId: randomUUID(),
    merchantId: randomUUID(),
    brandId: randomUUID(),
  };
  let count = 1;
  let changed = false;
  const tx = {
    category: {
      findFirstOrThrow: async ({ where }: { where: object }) => {
        assert.deepEqual(where, { ...scope, id: categoryId, deletedAt: null });
      },
      update: async () => {
        changed = true;
      },
    },
    product: { count: async () => count },
  };
  const db = { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) };
  const categoryId = randomUUID();
  const controller = new CatalogController(db as unknown as DatabaseService);
  await assert.rejects(
    controller.archiveCategory({ scope } as AdminRequest, categoryId),
    /分类下仍有商品/,
  );
  assert.equal(changed, false);
  count = 0;
  await controller.archiveCategory({ scope } as AdminRequest, categoryId);
  assert.equal(changed, true);
});
