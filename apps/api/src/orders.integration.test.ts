import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { parseConfig } from './config.js';
import { reserveInventory, settleInventory } from './order-inventory.js';
import { readCheckout, defaultCheckoutTerms } from './checkout-reader.js';

test('订单存储：租户复合外键、幂等键、不可变快照与事务回滚', async () => {
  const config = parseConfig(process.env);
  assert.equal(config.environment, 'test');
  assert.match(new URL(config.databaseUrl).pathname, /test/);
  const db = new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
  });
  const merchantId = randomUUID(),
    brandId = randomUUID();
  const scope = { merchantId, brandId, storeId: randomUUID() };
  const other = { ...scope, storeId: randomUUID() };
  try {
    await db.merchant.create({
      data: { id: merchantId, name: '订单隔离测试' },
    });
    await db.brand.create({
      data: { id: brandId, merchantId, name: '订单品牌' },
    });
    for (const s of [scope, other])
      await db.store.create({
        data: { id: s.storeId, merchantId, brandId, name: '订单门店' },
      });
    const category = await db.category.create({
      data: { ...scope, name: '分类' },
    });
    const product = await db.product.create({
      data: { ...scope, name: '商品', categoryId: category.id },
    });
    const variant = await db.variant.create({
      data: {
        ...scope,
        productId: product.id,
        name: '规格',
        salePriceFen: 1880,
        stockQuantity: 1,
      },
    });
    const checkout = {
      fulfillment: 'PICKUP' as const,
      items: [{ variantId: variant.id, quantity: 1, modifierIds: [] }],
    };
    const preview = await db.$transaction((tx) =>
      readCheckout(tx, scope, 'test-owner', checkout),
    );
    assert.equal(preview.publicResult.decision, 'MANUAL_REVIEW');
    assert.equal(preview.publicResult.payableFen, 1880);
    assert.equal(preview.publicResult.lines[0]!.productName, '商品');
    for (const forbidden of [
      'costFen',
      'variableCostFen',
      'contributionProfitFen',
      'recipeId',
      'purchaseIds',
      'minimumProfitFen',
    ])
      assert.equal(
        JSON.stringify(preview.publicResult).includes(forbidden),
        false,
      );
    await db.orderSettings.create({
      data: { ...scope, actor: 'test-owner', terms: defaultCheckoutTerms },
    });
    const configured = await db.$transaction((tx) =>
      readCheckout(tx, scope, 'test-owner', checkout),
    );
    assert.equal(configured.publicResult.decision, 'MANUAL_REVIEW');
    assert.notEqual(configured.fingerprint, preview.fingerprint);
    const quote = await db.mockDeliveryQuote.create({
      data: {
        ...scope,
        actor: 'test-owner',
        priceFen: 600,
        distanceMeters: 3000,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await assert.rejects(
      db.$transaction((tx) =>
        readCheckout(tx, scope, 'different-actor', {
          ...checkout,
          fulfillment: 'DELIVERY',
          quoteId: quote.id,
        }),
      ),
    );
    await assert.rejects(
      db.$transaction((tx) =>
        readCheckout(tx, other, 'test-owner', {
          ...checkout,
          fulfillment: 'DELIVERY',
          quoteId: quote.id,
        }),
      ),
    );
    const delivery = await db.$transaction((tx) =>
      readCheckout(tx, scope, 'test-owner', {
        ...checkout,
        fulfillment: 'DELIVERY',
        quoteId: quote.id,
      }),
    );
    assert.equal(delivery.publicResult.decision, 'MANUAL_REVIEW');
    await db.mockDeliveryQuote.update({
      where: { id: quote.id },
      data: { invalidatedAt: new Date() },
    });
    await assert.rejects(
      db.$transaction((tx) =>
        readCheckout(tx, scope, 'test-owner', {
          ...checkout,
          fulfillment: 'DELIVERY',
          quoteId: quote.id,
        }),
      ),
    );
    const data = {
      ...scope,
      actor: 'test-owner',
      idempotencyKey: randomUUID(),
      requestHash: 'hash',
      request: {},
      snapshot: { name: '历史商品', salePriceFen: 1880 },
      evidence: { costFen: 420 },
      fingerprint: 'basis',
      mode: 'PICKUP',
      payableFen: 1880,
      expiresAt: new Date(Date.now() + 60000),
    };
    const order = await db.order.create({ data });
    await assert.rejects(db.order.create({ data }));
    await assert.rejects(
      db.order.create({
        data: {
          ...data,
          idempotencyKey: randomUUID(),
          merchantId: randomUUID(),
        },
      }),
    );
    await assert.rejects(
      db.orderItem.create({
        data: {
          ...other,
          orderId: order.id,
          variantId: variant.id,
          quantity: 1,
          finiteStock: true,
          snapshot: {},
        },
      }),
    );
    await assert.rejects(
      db.orderItem.create({
        data: {
          ...scope,
          orderId: order.id,
          variantId: variant.id,
          quantity: 0,
          finiteStock: true,
          snapshot: {},
        },
      }),
    );
    await assert.rejects(
      db.order.update({
        where: { id: order.id },
        data: { snapshot: { salePriceFen: 1 } },
      }),
    );
    await assert.rejects(
      db.order.update({ where: { id: order.id }, data: { payableFen: 1 } }),
    );
    await db.product.update({
      where: { id: product.id },
      data: { name: '更改后的商品' },
    });
    assert.deepEqual(
      (await db.order.findUniqueOrThrow({ where: { id: order.id } })).snapshot,
      data.snapshot,
    );
    const item = await db.orderItem.create({
      data: {
        ...scope,
        orderId: order.id,
        variantId: variant.id,
        quantity: 1,
        finiteStock: true,
        snapshot: {},
      },
    });
    await assert.rejects(
      db.orderItem.update({ where: { id: item.id }, data: { quantity: 2 } }),
    );
    const event = await db.orderEvent.create({
      data: {
        ...scope,
        orderId: order.id,
        actor: 'test-owner',
        idempotencyKey: randomUUID(),
        requestHash: 'hash',
        action: 'CREATE',
        before: {},
        after: {},
      },
    });
    await assert.rejects(
      db.orderEvent.update({
        where: { id: event.id },
        data: { action: 'PAY' },
      }),
    );
    await assert.rejects(
      db.variant.update({
        where: { id: variant.id },
        data: { reservedQuantity: 2 },
      }),
    );
    const rollbackKey = randomUUID();
    await assert.rejects(
      db.$transaction(async (tx) => {
        const incomplete = await tx.order.create({
          data: { ...data, idempotencyKey: rollbackKey },
        });
        await tx.variant.update({
          where: { id: variant.id },
          data: { reservedQuantity: 1 },
        });
        await tx.orderItem.create({
          data: {
            ...scope,
            orderId: incomplete.id,
            variantId: randomUUID(),
            quantity: 1,
            finiteStock: true,
            snapshot: {},
          },
        });
      }),
    );
    assert.equal(
      await db.order.count({
        where: { ...scope, idempotencyKey: rollbackKey },
      }),
      0,
    );
    assert.equal(
      (await db.variant.findUniqueOrThrow({ where: { id: variant.id } }))
        .reservedQuantity,
      0,
    );
    const races = await Promise.allSettled(
      [0, 1].map(() =>
        db.$transaction((tx) =>
          reserveInventory(tx, scope, [{ variantId: variant.id, quantity: 1 }]),
        ),
      ),
    );
    assert.equal(races.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(races.filter((r) => r.status === 'rejected').length, 1);
    assert.equal(
      (await db.variant.findUniqueOrThrow({ where: { id: variant.id } }))
        .reservedQuantity,
      1,
    );
    await db.$transaction((tx) =>
      settleInventory(
        tx,
        scope,
        [{ variantId: variant.id, quantity: 1, finiteStock: true }],
        false,
        'test-owner',
        order.id,
      ),
    );
    assert.equal(
      (await db.variant.findUniqueOrThrow({ where: { id: variant.id } }))
        .stockQuantity,
      1,
    );
    await db.$transaction((tx) =>
      reserveInventory(tx, scope, [{ variantId: variant.id, quantity: 1 }]),
    );
    await db.$transaction((tx) =>
      settleInventory(
        tx,
        scope,
        [{ variantId: variant.id, quantity: 1, finiteStock: true }],
        true,
        'test-owner',
        order.id,
      ),
    );
    const consumed = await db.variant.findUniqueOrThrow({
      where: { id: variant.id },
    });
    assert.equal(consumed.stockQuantity, 0);
    assert.equal(consumed.reservedQuantity, 0);
    await assert.rejects(
      db.$transaction((tx) =>
        reserveInventory(tx, other, [{ variantId: variant.id, quantity: 1 }]),
      ),
    );
    await db.variant.update({
      where: { id: variant.id },
      data: { unlimitedStock: true },
    });
    const unlimited = await db.$transaction((tx) =>
      reserveInventory(tx, scope, [{ variantId: variant.id, quantity: 100 }]),
    );
    assert.equal(unlimited[0]!.finiteStock, false);
    await db.$transaction((tx) =>
      settleInventory(tx, scope, unlimited, true, 'test-owner', order.id),
    );
    assert.equal(
      (await db.variant.findUniqueOrThrow({ where: { id: variant.id } }))
        .stockQuantity,
      0,
    );
  } finally {
    await db.orderSettings.deleteMany({ where: { merchantId } });
    await db.mockDeliveryQuote.deleteMany({ where: { merchantId } });
    await db.inventoryMovement.deleteMany({ where: { merchantId } });
    await db.orderEvent.deleteMany({ where: { merchantId } });
    await db.orderItem.deleteMany({ where: { merchantId } });
    await db.order.deleteMany({ where: { merchantId } });
    await db.variant.deleteMany({ where: { merchantId } });
    await db.product.deleteMany({ where: { merchantId } });
    await db.category.deleteMany({ where: { merchantId } });
    await db.store.deleteMany({ where: { merchantId } });
    await db.brand.deleteMany({ where: { merchantId } });
    await db.merchant.deleteMany({ where: { id: merchantId } });
    await db.$disconnect();
  }
});
