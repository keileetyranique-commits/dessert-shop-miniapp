import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { parseConfig } from './config.js';
test('Phase 1 real admin, tenant constraints and complete product cost flow', async (t) => {
  const original = parseConfig(process.env);
  assert.equal(original.environment, 'test');
  assert.match(new URL(original.databaseUrl).pathname, /test/);
  const db = new PrismaClient({
    datasources: { db: { url: original.databaseUrl } },
  });
  const merchants = [randomUUID(), randomUUID()],
    brands = [randomUUID(), randomUUID()],
    stores = [randomUUID(), randomUUID(), randomUUID()];
  const ownerToken = randomBytes(32).toString('hex'),
    otherToken = randomBytes(32).toString('hex'),
    managerToken = randomBytes(32).toString('hex');
  const costToken = randomBytes(32).toString('hex');
  const brandOwnerToken = randomBytes(32).toString('hex');
  const identities = [
    {
      id: 'cost-manager',
      token: costToken,
      merchantId: merchants[0],
      brandId: brands[0],
      storeIds: [stores[0]],
      role: 'COST_MANAGER',
    },
    {
      id: 'brand-owner',
      token: brandOwnerToken,
      merchantId: merchants[0]!,
      brandId: brands[0],
      storeIds: '*',
      role: 'OWNER',
    },
    {
      id: 'test-owner',
      token: ownerToken,
      merchantId: merchants[0],
      brandId: brands[0],
      storeIds: [stores[0]],
      role: 'OWNER',
    },
    {
      id: 'test-other',
      token: otherToken,
      merchantId: merchants[1],
      brandId: brands[1],
      storeIds: [stores[1]],
      role: 'OWNER',
    },
    {
      id: 'test-manager',
      token: managerToken,
      merchantId: merchants[0],
      brandId: brands[0],
      storeIds: [stores[0]],
      role: 'MANAGER',
    },
  ];
  const config = parseConfig({
    ...process.env,
    APP_ENV: 'production',
    NODE_ENV: 'production',
    TEST_MODE: 'false',
    ADMIN_IDENTITIES: JSON.stringify(identities),
  });
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    for (let i = 0; i < 2; i++) {
      await db.merchant.create({
        data: { id: merchants[i]!, name: 'Test merchant' },
      });
      await db.brand.create({
        data: { id: brands[i]!, merchantId: merchants[i]!, name: 'Test brand' },
      });
      await db.store.create({
        data: {
          id: stores[i]!,
          merchantId: merchants[i]!,
          brandId: brands[i]!,
          name: 'Test store',
        },
      });
    }
    await db.store.create({
      data: {
        id: stores[2]!,
        merchantId: merchants[0]!,
        brandId: brands[0]!,
        name: 'Unassigned store',
      },
    });
    app = await createApp(config);
    await app.listen(0, '127.0.0.1');
    const base = (await app.getUrl()) + '/api/v1/admin';
    async function request(
      path: string,
      method = 'GET',
      body?: unknown,
      expected = 200,
      token = ownerToken,
      store: string = stores[0]!,
    ) {
      const res = await fetch(base + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + token,
          'X-Store-Id': store,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const value = await res.json();
      assert.equal(res.status, expected, JSON.stringify(value));
      return value;
    }
    await t.test(
      'production auth rejects absent/forged identities and unauthorized stores',
      async () => {
        const response = await fetch(base + '/products', {
          headers: {
            'x-dev-user': 'owner',
            'x-merchant-id': merchants[0]!,
            'x-store-id': stores[0]!,
          },
        });
        assert.equal(response.status, 401);
        await request(
          '/products',
          'GET',
          undefined,
          403,
          ownerToken,
          stores[1]!,
        );
        await request(
          '/products',
          'GET',
          undefined,
          403,
          ownerToken,
          stores[2]!,
        );
        await request(
          '/costs/ingredients',
          'GET',
          undefined,
          403,
          managerToken,
        );
        await request(
          '/categories',
          'POST',
          { name: 'forged', merchantId: merchants[1] },
          400,
        );
      },
    );
    await t.test(
      'brand OWNER can create a store but cannot use another brand',
      async () => {
        const created = await request(
          '/stores',
          'POST',
          { name: '后台创建门店' },
          201,
          brandOwnerToken,
        );
        assert.equal(created.merchantId, merchants[0]);
        assert.equal(created.brandId, brands[0]);
        const otherBrand = await db.brand.create({
          data: { merchantId: merchants[0]!, name: 'Other brand' },
        });
        const otherStore = await db.store.create({
          data: {
            merchantId: merchants[0]!,
            brandId: otherBrand.id,
            name: 'Other brand store',
          },
        });
        await request(
          '/products',
          'GET',
          undefined,
          403,
          brandOwnerToken,
          otherStore.id,
        );
        await request(
          '/stores',
          'POST',
          { name: 'forbidden' },
          403,
          managerToken,
        );
      },
    );
    const category = await request(
      '/categories',
      'POST',
      { name: '通用目录' },
      201,
    );
    const product = await request(
      '/products',
      'POST',
      { name: '测试饮品', categoryId: category.id },
      201,
    );
    const sku = await request(
      '/products/' + product.id + '/variants',
      'POST',
      { name: '标准规格', salePriceFen: 1800, stockQuantity: 10 },
      201,
    );
    await t.test(
      'product/SKU creation, generic modifiers and tenant isolation',
      async () => {
        const group = await request(
          '/products/' + product.id + '/modifier-groups',
          'POST',
          { name: '通用附加选项' },
          201,
        );
        await request(
          '/modifier-groups/' + group.id + '/modifiers',
          'POST',
          { name: '额外包装', salePriceFen: 100 },
          201,
        );
        const products = await request('/products');
        assert.equal(products[0].variantRecords[0].salePriceFen, 1800);
        assert.equal(
          products[0].modifierGroupRecords[0].modifierRecords[0].name,
          '额外包装',
        );
        await request(
          '/products/' + product.id,
          'GET',
          undefined,
          404,
          otherToken,
          stores[1]!,
        );
        await request(
          '/products/' + product.id,
          'PATCH',
          { name: 'attack' },
          404,
          otherToken,
          stores[1]!,
        );
        for (const salePriceFen of [1.2, Number.MAX_SAFE_INTEGER + 1])
          await request(
            '/products/' + product.id + '/variants',
            'POST',
            { name: 'bad', salePriceFen },
            400,
          );
      },
    );
    await t.test(
      'production role matrix and modifier costs are enforced server-side',
      async () => {
        for (const [path, method, body] of [
          ['/products', 'POST', { name: 'blocked', categoryId: category.id }],
          ['/products/' + product.id, 'PATCH', { name: 'blocked' }],
          ['/products/' + product.id, 'DELETE', undefined],
          ['/categories', 'POST', { name: 'blocked' }],
          ['/categories/' + category.id, 'PATCH', { name: 'blocked' }],
          [
            '/products/' + product.id + '/variants',
            'POST',
            { name: 'blocked', salePriceFen: 10 },
          ],
          ['/variants/' + sku.id, 'PATCH', { name: 'blocked' }],
          ['/variants/' + sku.id, 'DELETE', undefined],
          [
            '/variants/' + sku.id + '/stock',
            'POST',
            { delta: 1, reason: 'blocked' },
          ],
          [
            '/products/' + product.id + '/modifier-groups',
            'POST',
            { name: 'blocked' },
          ],
        ] as const)
          await request(path, method, body, 403, costToken);
        await request('/products', 'GET', undefined, 200, costToken);
        const managed = await request(
          '/products',
          'POST',
          { name: 'manager product', categoryId: category.id },
          201,
          managerToken,
        );
        await request(
          '/products/' + managed.id,
          'PATCH',
          { name: 'updated' },
          200,
          managerToken,
        );
        const managedSku = await request(
          '/products/' + managed.id + '/variants',
          'POST',
          { name: 'managed', salePriceFen: 10 },
          201,
          managerToken,
        );
        await request(
          '/variants/' + managedSku.id + '/stock',
          'POST',
          { delta: 2, reason: 'test' },
          201,
          managerToken,
        );
        await request(
          '/costs/ingredients',
          'POST',
          { name: 'blocked', baseUnit: 'g' },
          403,
          managerToken,
        );
        const group = await request(
          '/products/' + product.id + '/modifier-groups',
          'POST',
          { name: '服务选项' },
          201,
          managerToken,
        );
        const modifier = await request(
          '/modifier-groups/' + group.id + '/modifiers',
          'POST',
          { name: '礼品包装', salePriceFen: 200 },
          201,
          managerToken,
        );
        await request(
          '/modifier-groups/' + group.id + '/modifiers',
          'POST',
          { name: 'blocked', salePriceFen: 0 },
          403,
          costToken,
        );
        await request(
          '/modifiers/' + modifier.id,
          'PATCH',
          { name: 'blocked' },
          403,
          costToken,
        );
        assert.equal('costFen' in modifier, false);
        assert.equal(
          (await db.modifier.findUniqueOrThrow({ where: { id: modifier.id } }))
            .costFen,
          null,
        );
        await request(
          '/costs/modifiers/' + modifier.id,
          'PATCH',
          { costFen: 35 },
          200,
          costToken,
        );
        assert.equal(
          (await request('/costs/modifiers')).find(
            (m: { id: string }) => m.id === modifier.id,
          ).costFen,
          35,
        );
        await request(
          '/costs/modifiers/' + modifier.id,
          'PATCH',
          { costFen: 40 },
          200,
        );
        await request('/costs/modifiers', 'GET', undefined, 403, managerToken);
        await request(
          '/costs/modifiers/' + modifier.id,
          'PATCH',
          { costFen: 1 },
          403,
          managerToken,
        );
        await request(
          '/modifiers/' + modifier.id,
          'PATCH',
          { costFen: 1 },
          400,
          managerToken,
        );
        const edited = await request(
          '/modifiers/' + modifier.id,
          'PATCH',
          { salePriceFen: 250 },
          200,
          managerToken,
        );
        assert.equal('costFen' in edited, false);
        const listed = await request(
          '/products',
          'GET',
          undefined,
          200,
          managerToken,
        );
        assert.equal(JSON.stringify(listed).includes('costFen'), false);
        const costPath = '/costs/modifiers/' + modifier.id;
        await request(costPath, 'PATCH', { costFen: 35 }, 200, costToken);
        assert.equal(
          (await request(costPath, 'PATCH', { costFen: null }, 200, costToken))
            .costFen,
          null,
        );
        assert.equal(
          (await db.modifier.findUniqueOrThrow({ where: { id: modifier.id } }))
            .costFen,
          null,
        );
        assert.equal(
          (await request(costPath, 'PATCH', { costFen: 0 })).costFen,
          0,
        );
        await request(costPath, 'PATCH', { costFen: null }, 403, managerToken);
        await request(
          costPath,
          'PATCH',
          { costFen: null },
          404,
          otherToken,
          stores[1]!,
        );
        assert.equal(
          (await db.modifier.findUniqueOrThrow({ where: { id: modifier.id } }))
            .costFen,
          0,
        );
        await request(costPath, 'PATCH', {}, 400);
        for (const costFen of [
          -1,
          1.2,
          2147483648,
          Number.MAX_SAFE_INTEGER + 1,
          '10',
          '',
        ])
          await request(
            '/costs/modifiers/' + modifier.id,
            'PATCH',
            { costFen },
            400,
          );
        await request(
          '/costs/modifiers/' + modifier.id,
          'PATCH',
          { costFen: 0 },
          200,
        );
        await request(
          '/costs/modifiers/' + modifier.id,
          'PATCH',
          { costFen: 2147483647 },
          200,
        );
        await request(
          '/costs/modifiers/' + modifier.id,
          'PATCH',
          { costFen: 50 },
          200,
        );
        await request(
          '/costs/modifiers/' + modifier.id,
          'PATCH',
          { costFen: 1 },
          404,
          otherToken,
          stores[1]!,
        );
        assert.equal(
          (
            await request(
              '/costs/modifiers',
              'GET',
              undefined,
              200,
              otherToken,
              stores[1]!,
            )
          ).length,
          0,
        );
        await assert.rejects(
          db.modifier.update({
            where: { id: modifier.id },
            data: { costFen: -1 },
          }),
        );
        await request(
          '/products/' + managed.id,
          'DELETE',
          undefined,
          200,
          managerToken,
        );
      },
    );
    await t.test(
      'inventory is atomic, nonnegative and supports unlimited/sold-out modes',
      async () => {
        assert.equal(
          (
            await request(
              '/variants/' + sku.id + '/stock',
              'POST',
              { delta: -3, reason: '盘点' },
              201,
            )
          ).stockQuantity,
          7,
        );
        await request(
          '/variants/' + sku.id + '/stock',
          'POST',
          { delta: -8, reason: 'bad' },
          409,
        );
        const responses = await Promise.all(
          [1, 2].map(() =>
            fetch(base + '/variants/' + sku.id + '/stock', {
              method: 'POST',
              headers: {
                Authorization: 'Bearer ' + ownerToken,
                'X-Store-Id': stores[0]!,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ delta: -5, reason: '并发盘点' }),
            }),
          ),
        );
        assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
        assert.equal(
          (
            await request('/variants/' + sku.id, 'PATCH', {
              unlimitedStock: true,
              soldOut: true,
            })
          ).unlimitedStock,
          true,
        );
        assert.equal(
          (
            await request('/variants/' + sku.id, 'PATCH', {
              unlimitedStock: false,
              soldOut: false,
            })
          ).soldOut,
          false,
        );
      },
    );
    await t.test('missing costs return PARTIAL', async () => {
      const cost = await request(
        '/costs/variants/' + sku.id + '/cost?month=2026-09&fulfillment=PICKUP',
      );
      assert.equal(cost.completeness, 'PARTIAL');
      assert.ok(cost.missingInputs.includes('BOM'));
    });
    const ingredient = await request(
      '/costs/ingredients',
      'POST',
      { name: '芒果', baseUnit: 'g', lossRateBps: 2000 },
      201,
    );
    const coconut = await request(
      '/costs/ingredients',
      'POST',
      { name: '椰浆', baseUnit: 'ml' },
      201,
    );
    const sugar = await request(
      '/costs/ingredients',
      'POST',
      { name: '糖', baseUnit: 'g' },
      201,
    );
    const past = '2026-01-01T00:00:00Z';
    await request(
      '/costs/purchases',
      'POST',
      {
        ingredientId: ingredient.id,
        supplier: '测试供应商',
        quantity: '1',
        unit: 'kg',
        totalCostFen: 800,
        purchasedAt: past,
      },
      201,
    );
    await request(
      '/costs/purchases',
      'POST',
      {
        ingredientId: ingredient.id,
        supplier: '测试供应商',
        quantity: '1',
        unit: 'kg',
        totalCostFen: 1000,
        purchasedAt: '2026-02-01T00:00:00Z',
      },
      201,
    );
    await request(
      '/costs/purchases',
      'POST',
      {
        ingredientId: coconut.id,
        supplier: '测试供应商',
        quantity: '1',
        unit: 'L',
        totalCostFen: 1000,
        purchasedAt: past,
      },
      201,
    );
    await request(
      '/costs/purchases',
      'POST',
      {
        ingredientId: sugar.id,
        supplier: '测试供应商',
        quantity: '1',
        unit: 'kg',
        totalCostFen: 500,
        purchasedAt: past,
      },
      201,
    );
    const recipeBody = {
      items: [
        { ingredientId: ingredient.id, quantity: '100', unit: 'g' },
        { ingredientId: coconut.id, quantity: '100', unit: 'ml' },
        { ingredientId: sugar.id, quantity: '10', unit: 'g' },
      ],
      laborSeconds: 30,
      otherVariableCostFen: 10,
    };
    const recipe1 = await request(
      '/costs/variants/' + sku.id + '/recipe',
      'PUT',
      recipeBody,
    );
    await t.test(
      'purchase history, compatible units and versioned BOM',
      async () => {
        assert.equal(
          (await request('/costs/purchases')).filter(
            (p: { ingredientId: string }) => p.ingredientId === ingredient.id,
          ).length,
          2,
        );
        await request(
          '/costs/purchases',
          'POST',
          {
            ingredientId: ingredient.id,
            supplier: 'x',
            quantity: '1',
            unit: 'ml',
            totalCostFen: 10,
            purchasedAt: past,
          },
          400,
        );
        const recipe2 = await request(
          '/costs/variants/' + sku.id + '/recipe',
          'PUT',
          { ...recipeBody, laborSeconds: 60 },
        );
        assert.equal(recipe2.version, 2);
        await request(
          '/costs/variants/' + sku.id + '/recipes/' + recipe1.id + '/activate',
          'POST',
          {},
          201,
        );
        const versions = await request(
          '/costs/variants/' + sku.id + '/recipes',
        );
        assert.equal(versions.length, 2);
        assert.equal(
          versions.filter((v: { active: boolean }) => v.active).length,
          1,
        );
      },
    );
    await t.test(
      'database and API both reject cross-store BOM associations',
      async () => {
        const foreign = await request(
          '/costs/ingredients',
          'POST',
          { name: 'other', baseUnit: 'g' },
          201,
          otherToken,
          stores[1]!,
        );
        await request(
          '/costs/variants/' + sku.id + '/recipe',
          'PUT',
          { items: [{ ingredientId: foreign.id, quantity: '1', unit: 'g' }] },
          404,
        );
        await assert.rejects(
          db.recipeItem.create({
            data: {
              merchantId: merchants[0]!,
              brandId: brands[0]!,
              storeId: stores[0]!,
              recipeId: recipe1.id,
              ingredientId: foreign.id,
              quantity: '1',
              unit: 'g',
            },
          }),
        );
        await assert.rejects(
          db.variant.update({
            where: { id: sku.id },
            data: { stockQuantity: -1 },
          }),
        );
      },
    );
    const cup = await request(
      '/costs/packaging',
      'POST',
      { name: '包装杯', unitCostFen: 20 },
      201,
    );
    const lid = await request(
      '/costs/packaging',
      'POST',
      { name: '杯盖', unitCostFen: 10 },
      201,
    );
    await request('/costs/variants/' + sku.id + '/packaging', 'PUT', {
      fulfillment: 'PICKUP',
      items: [
        { packagingItemId: cup.id, quantity: 1 },
        { packagingItemId: lid.id, quantity: 1 },
      ],
    });
    await request('/costs/fixed/2026-09', 'PUT', {
      rentFen: 150000,
      payrollFen: 100000,
      utilitiesFen: 50000,
      propertyFeeFen: 0,
      depreciationFen: 0,
      softwareFen: 0,
      otherFen: 0,
    });
    await request('/costs/allocation/2026-09', 'PUT', {
      method: 'ITEM',
      expectedMonthlyOrders: 1000,
      expectedMonthlyItems: 3000,
      laborFenPerMinute: 100,
    });
    await t.test(
      'complete cost and immutable calculation snapshot',
      async () => {
        const cost = await request(
          '/costs/variants/' +
            sku.id +
            '/cost?month=2026-09&fulfillment=PICKUP',
        );
        assert.equal(cost.ingredientCostFen, 230);
        assert.equal(cost.packagingCostFen, 30);
        assert.equal(cost.variableCostFen, 60);
        assert.equal(cost.allocatedFixedCostFen, 100);
        assert.equal(cost.fullUnitCostFen, 420);
        assert.equal(cost.completeness, 'COMPLETE');
        assert.equal(cost.snapshotId, undefined);
        const before = await db.costSnapshot.count({
          where: { storeId: stores[0] },
        });
        for (let i = 0; i < 3; i++)
          await request(
            '/costs/variants/' +
              sku.id +
              '/cost?month=2026-09&fulfillment=PICKUP',
          );
        assert.equal(
          await db.costSnapshot.count({ where: { storeId: stores[0] } }),
          before,
        );
        const saved = await request(
          '/costs/variants/' + sku.id + '/cost/snapshots',
          'POST',
          { month: '2026-09', fulfillment: 'PICKUP' },
          201,
        );
        assert.equal(saved.fullUnitCostFen, cost.fullUnitCostFen);
        assert.ok(saved.snapshotId);
        assert.equal(
          await db.costSnapshot.count({ where: { storeId: stores[0] } }),
          before + 1,
        );
        cost.snapshotId = saved.snapshotId;
        await request(
          '/costs/snapshots/' + saved.snapshotId,
          'GET',
          undefined,
          404,
          brandOwnerToken,
          stores[2]!,
        );

        await request(
          '/costs/purchases',
          'POST',
          {
            ingredientId: ingredient.id,
            supplier: 'changed',
            quantity: '1',
            unit: 'kg',
            totalCostFen: 2000,
            purchasedAt: '2026-03-01T00:00:00Z',
          },
          201,
        );
        assert.equal(
          (await request('/costs/snapshots/' + cost.snapshotId)).result
            .fullUnitCostFen,
          420,
        );
        assert.equal(
          (
            await request(
              '/costs/variants/' +
                sku.id +
                '/cost?month=2026-09&fulfillment=PICKUP',
            )
          ).fullUnitCostFen,
          545,
        );
        await request(
          '/costs/snapshots/' + cost.snapshotId,
          'GET',
          undefined,
          404,
          otherToken,
          stores[1]!,
        );
      },
    );
    await t.test(
      'non-beverage SKU requires no core model changes and order allocation is explicit',
      async () => {
        const retail = await request(
          '/products',
          'POST',
          { name: '零售商品', categoryId: category.id },
          201,
        );
        const variant = await request(
          '/products/' + retail.id + '/variants',
          'POST',
          { name: '1kg', salePriceFen: 3000 },
          201,
        );
        await request('/costs/variants/' + variant.id + '/recipe', 'PUT', {
          items: [{ ingredientId: sugar.id, quantity: '1', unit: 'kg' }],
        });
        await request('/costs/variants/' + variant.id + '/packaging', 'PUT', {
          fulfillment: 'PICKUP',
          items: [],
        });
        await request('/costs/allocation/2026-09', 'PUT', {
          method: 'ORDER',
          expectedMonthlyOrders: 1000,
          expectedMonthlyItems: 3000,
          laborFenPerMinute: 0,
        });
        const path =
          '/costs/variants/' +
          variant.id +
          '/cost?month=2026-09&fulfillment=PICKUP';
        assert.equal((await request(path)).completeness, 'PARTIAL');
        assert.equal(
          (await request(path + '&itemsPerOrder=3')).fullUnitCostFen,
          600,
        );
      },
    );
    await t.test(
      'SKU archive blocks current operations and preserves historical records',
      async () => {
        const snapshot = await request(
          '/costs/variants/' + sku.id + '/cost/snapshots',
          'POST',
          { month: '2026-09', fulfillment: 'PICKUP' },
          201,
        );
        await request(
          '/variants/' + sku.id,
          'DELETE',
          undefined,
          404,
          otherToken,
          stores[1]!,
        );
        const archived = await request('/variants/' + sku.id, 'DELETE');
        assert.ok(archived.deletedAt);
        assert.equal(archived.status, 'INACTIVE');
        const detail = await request('/products/' + product.id);
        assert.equal(
          detail.variantRecords.some((v: { id: string }) => v.id === sku.id),
          false,
        );
        const list = await request('/products');
        assert.equal(
          list
            .find((p: { id: string }) => p.id === product.id)
            .variantRecords.some((v: { id: string }) => v.id === sku.id),
          false,
        );
        await request(
          '/variants/' + sku.id + '/stock',
          'POST',
          { delta: 1, reason: 'blocked' },
          409,
        );
        await request(
          '/variants/' + sku.id,
          'PATCH',
          { status: 'ACTIVE' },
          404,
        );
        await request(
          '/costs/variants/' + sku.id + '/recipe',
          'PUT',
          recipeBody,
          404,
        );
        await request(
          '/costs/variants/' + sku.id + '/recipes/' + recipe1.id + '/activate',
          'POST',
          {},
          404,
        );
        await request(
          '/costs/variants/' + sku.id + '/packaging',
          'PUT',
          { fulfillment: 'PICKUP', items: [] },
          404,
        );
        await request(
          '/costs/variants/' +
            sku.id +
            '/cost?month=2026-09&fulfillment=PICKUP',
          'GET',
          undefined,
          404,
        );
        await request(
          '/costs/variants/' + sku.id + '/cost/snapshots',
          'POST',
          { month: '2026-09', fulfillment: 'PICKUP' },
          404,
        );
        assert.equal(
          (await request('/costs/variants/' + sku.id + '/recipes')).length,
          2,
        );
        assert.equal(
          (await request('/costs/snapshots/' + snapshot.snapshotId)).id,
          snapshot.snapshotId,
        );
      },
    );
    await t.test(
      'latest purchase index supports ordered bounded lookup',
      async () => {
        const plan = await db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
          return tx.$queryRawUnsafe(
            'EXPLAIN (FORMAT JSON) SELECT * FROM purchase_records WHERE "storeId" = $1::uuid AND "ingredientId" = $2::uuid AND "purchasedAt" <= now() ORDER BY "purchasedAt" DESC, "createdAt" DESC, id DESC LIMIT 1',
            stores[0],
            ingredient.id,
          );
        });
        assert.ok(JSON.stringify(plan).includes('purchase_latest_idx'));
        assert.equal(
          JSON.stringify(plan).includes('"Node Type":"Sort"'),
          false,
        );
      },
    );
  } finally {
    if (app) await app.close();
    const where = { merchantId: { in: merchants } };
    await db.costSnapshot.deleteMany({ where });
    await db.skuPackaging.deleteMany({ where });
    await db.packagingConfiguration.deleteMany({ where });
    await db.recipeItem.deleteMany({ where });
    await db.recipe.deleteMany({ where });
    await db.inventoryMovement.deleteMany({ where });
    await db.modifier.deleteMany({ where });
    await db.modifierGroup.deleteMany({ where });
    await db.variant.deleteMany({ where });
    await db.product.deleteMany({ where });
    await db.category.deleteMany({ where });
    await db.purchaseRecord.deleteMany({ where });
    await db.ingredient.deleteMany({ where });
    await db.packagingItem.deleteMany({ where });
    await db.monthlyFixedCost.deleteMany({ where });
    await db.costAllocationRule.deleteMany({ where });
    await db.store.deleteMany({ where });
    await db.brand.deleteMany({ where });
    await db.merchant.deleteMany({ where: { id: { in: merchants } } });
    await db.$disconnect();
  }
});
