import 'reflect-metadata';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { parseConfig } from './config.js';

test('库存工作台：真实数据库、生产权限、幂等调整及状态隔离', async () => {
  const original = parseConfig(process.env);
  assert.equal(original.environment, 'test');
  assert.match(new URL(original.databaseUrl).pathname, /test/);
  const db = new PrismaClient();
  const merchantId = randomUUID(),
    brandId = randomUUID(),
    storeId = randomUUID();
  const scope = { merchantId, brandId, storeId };
  const tokens = ['OWNER', 'MANAGER', 'COST_MANAGER'].map(() =>
    randomBytes(32).toString('hex'),
  );
  const config = parseConfig({
    ...process.env,
    APP_ENV: 'production',
    TEST_MODE: 'false',
    ADMIN_IDENTITIES: JSON.stringify(
      ['OWNER', 'MANAGER', 'COST_MANAGER'].map((role, i) => ({
        id: role,
        token: tokens[i],
        merchantId,
        brandId,
        storeIds: [storeId],
        role,
      })),
    ),
  });
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await db.merchant.create({ data: { id: merchantId, name: '库存验收' } });
    await db.brand.create({ data: { id: brandId, merchantId, name: '品牌' } });
    await db.store.create({
      data: { id: storeId, merchantId, brandId, name: '门店' },
    });
    const category = await db.category.create({
      data: { ...scope, name: '饮品' },
    });
    const product = await db.product.create({
      data: { ...scope, name: '真实茶饮', categoryId: category.id },
    });
    const variant = await db.variant.create({
      data: {
        ...scope,
        productId: product.id,
        name: '标准',
        salePriceFen: 1880,
        stockQuantity: 10,
        reservedQuantity: 3,
      },
    });
    const unlimited = await db.variant.create({
      data: {
        ...scope,
        productId: product.id,
        name: '不限',
        salePriceFen: 2000,
        unlimitedStock: true,
      },
    });
    app = await createApp(config);
    await app.listen(0, '127.0.0.1');
    const base = (await app.getUrl()) + '/api/v1/admin';
    async function request(
      path: string,
      method = 'GET',
      body?: unknown,
      status = 200,
      role = 0,
      store = storeId,
    ) {
      const response = await fetch(base + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + tokens[role],
          'X-Store-Id': store,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const value = await response.json();
      assert.equal(response.status, status, JSON.stringify(value));
      return value;
    }
    const stock = '/variants/' + variant.id + '/stock';
    const settings = '/inventory/variants/' + variant.id;
    let list = await request('/inventory');
    assert.equal(list.total, 2);
    assert.equal(list.summary.products, 1);
    assert.equal(list.summary.reserved, 3);
    assert.equal(
      list.items.find((v: { id: string }) => v.id === variant.id).available,
      7,
    );
    assert.equal(
      list.items.find((v: { id: string }) => v.id === unlimited.id).available,
      null,
    );
    const maxVariant = await db.variant.create({
      data: {
        ...scope,
        productId: product.id,
        name: '整数边界',
        salePriceFen: 0,
        stockQuantity: 2147483646,
      },
    });
    await request(
      '/variants/' + maxVariant.id + '/stock',
      'POST',
      { delta: 1, reason: '最大边界' },
      201,
    );
    await request(
      '/variants/' + maxVariant.id + '/stock',
      'POST',
      { delta: 1, reason: '溢出拒绝' },
      409,
    );
    assert.equal(
      (await db.variant.findUniqueOrThrow({ where: { id: maxVariant.id } }))
        .stockQuantity,
      2147483647,
    );
    assert.equal(
      await db.inventoryMovement.count({ where: { variantId: maxVariant.id } }),
      1,
    );
    await db.inventoryMovement.deleteMany({
      where: { variantId: maxVariant.id },
    });
    await db.variant.delete({ where: { id: maxVariant.id } });
    const key = randomUUID();
    const body = { delta: 2, reason: '盘点补货', idempotencyKey: key };
    await Promise.all([
      request(stock, 'POST', body, 201),
      request(stock, 'POST', body, 201),
    ]);
    assert.equal(
      (await db.variant.findUniqueOrThrow({ where: { id: variant.id } }))
        .stockQuantity,
      12,
    );
    assert.equal(
      await db.inventoryMovement.count({
        where: { ...scope, variantId: variant.id },
      }),
      1,
    );
    await request(stock, 'POST', { ...body, delta: 3 }, 409);
    await request(stock, 'POST', { delta: -10, reason: '错误盘点' }, 409);
    await request(stock, 'POST', { delta: 2147483647, reason: '越界' }, 409);
    await request(stock, 'POST', { delta: 1, reason: '' }, 400);
    await request(
      '/variants/' + unlimited.id + '/stock',
      'POST',
      { delta: 1, reason: '不适用' },
      409,
    );
    await request(
      stock,
      'POST',
      { delta: -2, reason: '报损', idempotencyKey: randomUUID() },
      201,
      1,
    );
    await request(stock, 'POST', body, 403, 2);
    await request('/inventory', 'GET', undefined, 403, 0, randomUUID());
    await request(
      '/inventory/movements',
      'GET',
      undefined,
      403,
      0,
      randomUUID(),
    );
    await request(
      '/inventory/variants/' + randomUUID(),
      'PATCH',
      { lowStockThreshold: 7, reason: '预警', idempotencyKey: randomUUID() },
      404,
    );
    for (const threshold of [-1, 2147483648, 0.5])
      await request(
        settings,
        'PATCH',
        {
          lowStockThreshold: threshold,
          reason: '边界',
          idempotencyKey: randomUUID(),
        },
        400,
      );
    for (const threshold of [0, null, 2147483647, null]) {
      await request(settings, 'PATCH', {
        lowStockThreshold: threshold,
        reason: '设置及清空',
        idempotencyKey: randomUUID(),
      });
      const actual = await db.variant.findUniqueOrThrow({
        where: { id: variant.id },
      });
      assert.equal(actual.lowStockThreshold, threshold);
    }
    const unchanged = await db.variant.findUniqueOrThrow({
      where: { id: variant.id },
    });
    const countBefore = await db.inventoryMovement.count({ where: scope });
    for (const delta of [0, 0.5, -2147483648, 2147483648])
      await request(stock, 'POST', { delta, reason: '边界' }, 400);
    await request(stock, 'POST', { delta: -8, reason: '低于预占' }, 409);
    assert.equal(
      await db.inventoryMovement.count({ where: scope }),
      countBefore,
    );
    assert.deepEqual(
      await db.variant.findUniqueOrThrow({ where: { id: variant.id } }),
      unchanged,
    );
    assert.equal((await request('/inventory?mode=unlimited')).total, 1);
    assert.equal(
      (await request('/inventory?categoryId=' + category.id)).total,
      2,
    );
    assert.equal(
      (await request('/inventory?sort=available&direction=desc')).items[0].id,
      variant.id,
    );
    await request(settings, 'PATCH', {
      lowStockThreshold: 7,
      reason: '预警',
      idempotencyKey: randomUUID(),
    });
    list = await request(
      '/inventory?state=LOW&productSearch=茶&variantSearch=标准&pageSize=1',
    );
    assert.equal(list.total, 1);
    assert.equal(list.items[0].available, 7);
    assert.equal(list.items[0].state, 'LOW');
    assert.equal(
      (await request('/inventory?state=LOW&page=2&pageSize=1')).items.length,
      0,
    );
    await request(
      settings,
      'PATCH',
      { lowStockThreshold: 3, reason: '无权', idempotencyKey: randomUUID() },
      403,
      1,
    );
    const settingsBody = {
      soldOut: true,
      reason: '并发暂停',
      idempotencyKey: randomUUID(),
    };
    const priorSettings = await db.inventoryMovement.count({
      where: { ...scope, type: 'SETTINGS' },
    });
    await Promise.all([
      request(settings, 'PATCH', settingsBody),
      request(settings, 'PATCH', settingsBody),
    ]);
    assert.equal(
      await db.inventoryMovement.count({
        where: { ...scope, type: 'SETTINGS' },
      }),
      priorSettings + 1,
    );
    await request(settings, 'PATCH', { ...settingsBody, soldOut: false }, 409);
    assert.equal((await request('/inventory?soldOut=true')).total, 1);
    await request(settings, 'PATCH', {
      soldOut: false,
      reason: '恢复',
      idempotencyKey: randomUUID(),
    });
    await request('/variants/' + variant.id, 'PATCH', { soldOut: true });
    const legacyMovement = await db.inventoryMovement.findFirstOrThrow({
      where: { ...scope, reason: '商品编辑：更新售罄或库存模式' },
    });
    assert.equal(legacyMovement.actor, 'OWNER');
    assert.equal(
      (legacyMovement.before as { soldOut: boolean }).soldOut,
      false,
    );
    assert.equal((legacyMovement.after as { soldOut: boolean }).soldOut, true);
    await request('/variants/' + variant.id, 'PATCH', { soldOut: false });
    await request(settings, 'PATCH', {
      soldOut: true,
      reason: '设备检修',
      idempotencyKey: randomUUID(),
    });
    list = await request('/inventory?state=PAUSED');
    assert.equal(list.items[0].soldOutReason, '设备检修');
    await db.product.update({
      where: { id: product.id },
      data: { safetyHoldReason: '食品安全核查' },
    });
    await request(
      settings,
      'PATCH',
      { soldOut: false, reason: '恢复', idempotencyKey: randomUUID() },
      409,
    );
    assert.equal((await request('/inventory?state=SAFETY')).total, 2);
    await db.product.update({
      where: { id: product.id },
      data: { safetyHoldReason: '' },
    });
    await request(settings, 'PATCH', {
      soldOut: false,
      reason: '检查完成',
      idempotencyKey: randomUUID(),
    });
    const movements = await request(
      '/inventory/movements?type=ADJUSTMENT&variantId=' + variant.id,
    );
    assert.equal(movements.total, 2);
    assert.equal(
      movements.items.reduce(
        (s: number, m: { delta: number }) => s + m.delta,
        0,
      ),
      0,
    );
    assert.equal(movements.items[0].actor, 'MANAGER');
    assert.equal(movements.items[0].before.stockQuantity, 12);
    assert.equal(movements.items[0].after.stockQuantity, 10);
    assert.equal(movements.items[0].after.reservedQuantity, 3);
    assert.equal(movements.items[0].orderId, null);
    assert.equal(
      (await request('/inventory/movements?productSearch=不存在')).total,
      0,
    );
    assert.equal(
      (
        await request(
          '/inventory/movements?variantSearch=标准&type=ADJUSTMENT&pageSize=1&page=2',
        )
      ).items.length,
      1,
    );
    await request(
      '/inventory/movements?from=2026-11-03T00:00:00Z&to=2026-11-01T00:00:00Z',
      'GET',
      undefined,
      400,
    );
    await request(settings, 'PATCH', {
      soldOut: true,
      reason: '恢复边界测试',
      idempotencyKey: randomUUID(),
    });
    await db.product.update({
      where: { id: product.id },
      data: { status: 'INACTIVE' },
    });
    await request(
      settings,
      'PATCH',
      { soldOut: false, reason: '下架不能恢复', idempotencyKey: randomUUID() },
      409,
    );
    await db.product.update({
      where: { id: product.id },
      data: { status: 'ACTIVE' },
    });
    await request(stock, 'POST', { delta: -7, reason: '减至预占边界' }, 201);
    await request(settings, 'PATCH', {
      soldOut: false,
      lowStockThreshold: 0,
      reason: '零库存清标记',
      idempotencyKey: randomUUID(),
    });
    const empty = (await request('/inventory?state=EMPTY')).items[0];
    assert.equal(empty.available, 0);
    assert.equal(empty.lowStock, true);
    assert.equal(empty.soldOut, false);
    assert.equal((await request('/inventory?state=LOW')).total, 1);
    assert.equal(
      (await request('/inventory', 'GET', undefined, 200, 2)).summary.reserved,
      3,
    );
    await request(
      settings,
      'PATCH',
      { soldOut: true, reason: '成本角色无权', idempotencyKey: randomUUID() },
      403,
      2,
    );
    assert.equal(movements.items[0].variant.product.name, product.name);
    assert.equal(
      (await db.variant.findUniqueOrThrow({ where: { id: variant.id } }))
        .reservedQuantity,
      3,
    );
    await db.variant.update({
      where: { id: variant.id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    assert.equal((await request('/inventory?state=ARCHIVED')).total, 1);
    // Archived reservations are still real obligations, even when hidden in the default list.
    const archivedSummary = (await request('/inventory')).summary;
    assert.equal(archivedSummary.reserved, 3);
    assert.equal(archivedSummary.archivedReserved, 3);
    await request(stock, 'POST', { delta: 1, reason: '归档后补货' }, 409);
    await request(
      settings,
      'PATCH',
      { soldOut: false, reason: '归档后恢复', idempotencyKey: randomUUID() },
      404,
    );
  } finally {
    await app?.close();
    await db.inventoryMovement.deleteMany({ where: { merchantId } });
    await db.variant.deleteMany({ where: { merchantId } });
    await db.product.deleteMany({ where: { merchantId } });
    await db.category.deleteMany({ where: { merchantId } });
    await db.store.deleteMany({ where: { merchantId } });
    await db.brand.deleteMany({ where: { merchantId } });
    await db.merchant.deleteMany({ where: { id: merchantId } });
    await db.$disconnect();
  }
});

test('库存：真实跨门店、跨品牌、跨商户夹具在生产配置下读写隔离', async () => {
  const original = parseConfig(process.env);
  assert.equal(original.environment, 'test');
  assert.match(new URL(original.databaseUrl).pathname, /test/);
  const db = new PrismaClient();
  const a = {
    merchantId: randomUUID(),
    brandId: randomUUID(),
    storeId: randomUUID(),
  };
  const scopes = [
    a,
    { ...a, storeId: randomUUID() },
    { ...a, brandId: randomUUID(), storeId: randomUUID() },
    { merchantId: randomUUID(), brandId: randomUUID(), storeId: randomUUID() },
  ];
  const token = randomBytes(32).toString('hex');
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  const variants: string[] = [];
  try {
    for (const scope of scopes) {
      await db.merchant.upsert({
        where: { id: scope.merchantId },
        create: { id: scope.merchantId, name: '隔离商户' },
        update: {},
      });
      await db.brand.upsert({
        where: { id: scope.brandId },
        create: {
          id: scope.brandId,
          merchantId: scope.merchantId,
          name: '隔离品牌',
        },
        update: {},
      });
      await db.store.create({
        data: {
          merchantId: scope.merchantId,
          brandId: scope.brandId,
          id: scope.storeId,
          name: '隔离门店',
        },
      });
      const category = await db.category.create({
        data: { ...scope, name: '分类' },
      });
      const product = await db.product.create({
        data: { ...scope, categoryId: category.id, name: '同名商品' },
      });
      const variant = await db.variant.create({
        data: {
          ...scope,
          productId: product.id,
          name: '同名规格',
          stockQuantity: 10,
          salePriceFen: 1880,
        },
      });
      variants.push(variant.id);
      await db.inventoryMovement.create({
        data: {
          ...scope,
          variantId: variant.id,
          delta: 1,
          actor: 'other',
          reason: '不可泄漏',
        },
      });
    }
    app = await createApp(
      parseConfig({
        ...process.env,
        APP_ENV: 'production',
        TEST_MODE: 'false',
        ADMIN_IDENTITIES: JSON.stringify([
          {
            id: 'owner',
            token,
            merchantId: a.merchantId,
            brandId: a.brandId,
            storeIds: '*',
            role: 'OWNER',
          },
        ]),
      }),
    );
    await app.listen(0, '127.0.0.1');
    const base = (await app.getUrl()) + '/api/v1/admin';
    async function request(
      path: string,
      status = 200,
      method = 'GET',
      body?: unknown,
      storeId = a.storeId,
    ) {
      const response = await fetch(base + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + token,
          'X-Store-Id': storeId,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      assert.equal(response.status, status, JSON.stringify(result));
      return result;
    }
    assert.equal((await request('/inventory')).total, 1);
    assert.equal((await request('/inventory/movements')).total, 1);
    for (let i = 1; i < scopes.length; i++) {
      const v = variants[i]!;
      assert.equal(
        (await request('/inventory/movements?variantId=' + v)).total,
        0,
      );
      await request('/variants/' + v + '/stock', 409, 'POST', {
        delta: 1,
        reason: '越权',
        idempotencyKey: randomUUID(),
      });
      await request('/inventory/variants/' + v, 404, 'PATCH', {
        soldOut: true,
        reason: '越权',
        idempotencyKey: randomUUID(),
      });
      await request('/inventory/variants/' + v, 404, 'PATCH', {
        lowStockThreshold: 5,
        reason: '越权',
        idempotencyKey: randomUUID(),
      });
      assert.equal(
        (await db.variant.findUniqueOrThrow({ where: { id: v } }))
          .stockQuantity,
        10,
      );
      assert.equal(
        await db.inventoryMovement.count({ where: { variantId: v } }),
        1,
      );
      // Brand-wide owner can choose the sibling store, but cannot choose another brand/merchant.
      await request(
        '/inventory',
        i === 1 ? 200 : 403,
        'GET',
        undefined,
        scopes[i]!.storeId,
      );
      await request(
        '/inventory/movements',
        i === 1 ? 200 : 403,
        'GET',
        undefined,
        scopes[i]!.storeId,
      );
    }
  } finally {
    await app?.close();
    for (const scope of [...scopes].reverse()) {
      await db.inventoryMovement.deleteMany({ where: scope });
      await db.variant.deleteMany({ where: scope });
      await db.product.deleteMany({ where: scope });
      await db.category.deleteMany({ where: scope });
      await db.store.deleteMany({ where: { id: scope.storeId } });
    }
    await db.brand.deleteMany({
      where: { id: { in: scopes.map((s) => s.brandId) } },
    });
    await db.merchant.deleteMany({
      where: { id: { in: scopes.map((s) => s.merchantId) } },
    });
    await db.$disconnect();
  }
});
