import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { parseConfig } from './config.js';
import { reserveInventory, settleInventory } from './order-inventory.js';
import { readCheckout, defaultCheckoutTerms } from './checkout-reader.js';
import { OrdersService } from './orders.service.js';
import type { DatabaseService } from './infrastructure.js';
import type { AdminRequest } from './auth.js';
import { createApp } from './app.js';

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
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
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
    await assert.rejects(
      db.orderItem.delete({ where: { id: item.id } }),
      /Immutable order history/,
    );
    await assert.rejects(
      db.orderEvent.delete({ where: { id: event.id } }),
      /Immutable order history/,
    );
    await assert.rejects(
      db.order.delete({ where: { id: order.id } }),
      /Immutable order history/,
    );
    await db.order.update({
      where: { id: order.id },
      data: { issue: '合法状态字段更新', version: { increment: 1 } },
    });
    assert.equal(await db.orderEvent.count({ where: { id: event.id } }), 1);
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
    // This raw inventory fixture has been consumed; it is not an outstanding reservation.
    await db.order.update({
      where: { id: order.id },
      data: { reservationStatus: 'CONSUMED' },
    });
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
    // Explicit fixture: no ingredients or packaging; other variable cost is 300 Fen.
    await db.recipe.create({
      data: {
        ...scope,
        variantId: variant.id,
        version: 1,
        otherVariableCostFen: 300,
      },
    });
    await db.packagingConfiguration.create({
      data: { ...scope, variantId: variant.id, fulfillment: 'PICKUP' },
    });
    const month = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
    }).format(new Date());
    await db.monthlyFixedCost.create({
      data: {
        ...scope,
        month,
        rentFen: 0,
        utilitiesFen: 0,
        payrollFen: 0,
        propertyFeeFen: 0,
        depreciationFen: 0,
        softwareFen: 0,
        otherFen: 0,
      },
    });
    await db.costAllocationRule.create({
      data: {
        ...scope,
        month,
        method: 'ORDER',
        expectedMonthlyOrders: 100,
        expectedMonthlyItems: 100,
        laborFenPerMinute: 0,
      },
    });
    const noFee = { rateBps: 0, fixedFen: 0, minimumFen: 0, capFen: null };
    await db.pricingRule.create({
      data: {
        ...scope,
        actor: 'test-owner',
        rules: {
          minimumProfitFen: 100,
          minimumMarginBps: 0,
          targetProfitFen: 100,
          targetMarginBps: 0,
          maximumDistanceMeters: 8000,
          maximumSubsidyFen: 0,
          allowTopup: false,
          payment: noFee,
          commission: noFee,
        },
      },
    });
    await db.variant.update({
      where: { id: variant.id },
      data: { unlimitedStock: false, stockQuantity: 3 },
    });
    const service = new OrdersService(db as DatabaseService, config);
    const caller: AdminRequest = {
      scope,
      headers: {},
      identity: {
        ...scope,
        id: 'test-owner',
        role: 'OWNER',
        token: 'unused-test-identity',
        storeIds: [scope.storeId],
      },
    };
    const readyPreview = await service.preview(caller, checkout);
    assert.equal(readyPreview.decision, 'PASS');
    const createInput = {
      previewId: readyPreview.previewId,
      idempotencyKey: randomUUID(),
      acceptTopup: false,
    };
    const [created, repeated] = await Promise.all([
      service.create(caller, createInput),
      service.create(caller, createInput),
    ]);
    assert.equal(created.id, repeated.id);
    assert.equal(
      (await db.variant.findUniqueOrThrow({ where: { id: variant.id } }))
        .reservedQuantity,
      1,
    );
    await assert.rejects(
      service.create(caller, { ...createInput, acceptTopup: true }),
    );
    const paid = await service.action(
      caller,
      created.id,
      'PAY',
      'payment-success',
    );
    assert.equal(paid.orderStatus, 'AWAITING_ACCEPTANCE');
    assert.deepEqual(
      await service.action(caller, created.id, 'PAY', 'payment-success'),
      paid,
    );
    assert.equal(
      (
        await service.action(
          caller,
          created.id,
          'PAY_FAIL',
          'late-payment-failure',
        )
      ).paymentStatus,
      'PAID',
    );
    await service.action(caller, created.id, 'ACCEPT', 'accept');
    await service.action(caller, created.id, 'READY', 'ready');
    await Promise.all([
      service.action(caller, created.id, 'PICKUP', 'pickup'),
      service.action(caller, created.id, 'PICKUP', 'pickup'),
    ]);
    assert.equal(
      (await db.variant.findUniqueOrThrow({ where: { id: variant.id } }))
        .stockQuantity,
      2,
    );
    assert.equal(
      (await db.variant.findUniqueOrThrow({ where: { id: variant.id } }))
        .reservedQuantity,
      0,
    );
    assert.equal(
      await db.orderEvent.count({
        where: { orderId: created.id, action: 'PICKUP' },
      }),
      1,
    );
    const stale = await service.preview(caller, checkout);
    await db.variant.update({
      where: { id: variant.id },
      data: { salePriceFen: 1990 },
    });
    await assert.rejects(
      service.create(caller, {
        previewId: stale.previewId,
        idempotencyKey: randomUUID(),
        acceptTopup: false,
      }),
    );
    assert.equal(
      (await db.variant.findUniqueOrThrow({ where: { id: variant.id } }))
        .reservedQuantity,
      0,
    );
    for (const fulfillment of ['DELIVERY', 'DINE_IN'])
      await db.packagingConfiguration.create({
        data: { ...scope, variantId: variant.id, fulfillment },
      });
    await db.variant.update({
      where: { id: variant.id },
      data: { stockQuantity: 10 },
    });
    await db.orderSettings.update({
      where: { storeId: scope.storeId },
      data: {
        terms: { ...defaultCheckoutTerms, customerDeliveryFeeFen: 1100 },
        revision: { increment: 1 },
      },
    });
    for (const distanceMeters of [3000, 5000, 8000]) {
      const quote = await db.mockDeliveryQuote.create({
        data: {
          ...scope,
          actor: caller.identity.id,
          distanceMeters,
          priceFen: 600 + (distanceMeters / 1000 - 3) * 100,
          expiresAt: new Date(Date.now() + 60000),
        },
      });
      const preview = await service.preview(caller, {
        ...checkout,
        fulfillment: 'DELIVERY',
        quoteId: quote.id,
      });
      assert.equal(preview.decision, 'PASS');
      const delivery = await service.create(caller, {
        previewId: preview.previewId,
        idempotencyKey: randomUUID(),
        acceptTopup: false,
      });
      await service.action(caller, delivery.id, 'PAY', randomUUID());
      // A preparation longer than 16 minutes and subsequent price/rule edits do not rewrite the paid contract.
      const savedRule = await db.pricingRule.findFirstOrThrow({ where: scope });
      await db.pricingRule.update({
        where: { id: savedRule.id },
        data: {
          rules: {
            ...(savedRule.rules as Record<string, unknown>),
            minimumProfitFen: 99999,
          },
        },
      });
      await db.variant.update({
        where: { id: variant.id },
        data: { salePriceFen: 9999 },
      });
      await service.action(caller, delivery.id, 'ACCEPT', randomUUID());
      await service.action(caller, delivery.id, 'READY', randomUUID());
      await db.mockDeliveryQuote.update({
        where: { id: quote.id },
        data: {
          createdAt: new Date(Date.now() - 17 * 60000),
          expiresAt: new Date(Date.now() - 60000),
        },
      });
      await assert.rejects(
        service.action(caller, delivery.id, 'DISPATCH', randomUUID()),
      );
      const renewed = await service.requote(
        caller,
        delivery.id,
        'requote-retry',
        false,
        true,
      );
      assert.equal(
        (
          await service.requote(
            caller,
            delivery.id,
            'requote-retry',
            false,
            true,
          )
        ).version,
        renewed.version,
      );
      for (const a of [
        'DISPATCH',
        'DRIVER_FAIL',
        'DISPATCH',
        'DRIVER_ACCEPT',
        'DELIVERED',
      ] as const)
        await service.action(caller, delivery.id, a, randomUUID());
      assert.equal(
        (await service.action(caller, delivery.id, 'DELIVERED', randomUUID()))
          .orderStatus,
        'COMPLETED',
      );
      assert.deepEqual(
        (await db.order.findUniqueOrThrow({ where: { id: delivery.id } }))
          .snapshot,
        delivery.snapshot,
      );
      assert.equal(
        await db.orderEvent.count({
          where: { orderId: delivery.id, action: 'DELIVERED' },
        }),
        1,
      );
      await db.pricingRule.update({
        where: { id: savedRule.id },
        data: { rules: savedRule.rules! },
      });
      await db.variant.update({
        where: { id: variant.id },
        data: { salePriceFen: 1990 },
      });
    }
    // Stopping new sales must not strand paid, reserved orders.
    for (const stop of ['soldOut', 'variant', 'product', 'store'] as const) {
      const stockBefore = await db.variant.findUniqueOrThrow({
        where: { id: variant.id },
      });
      await db.variant.update({
        where: { id: variant.id },
        data: { stockQuantity: 20 },
      });
      const q = await db.mockDeliveryQuote.create({
        data: {
          ...scope,
          actor: caller.identity.id,
          priceFen: 600,
          distanceMeters: 3000,
          expiresAt: new Date(Date.now() + 900000),
        },
      });
      const request = {
        ...checkout,
        fulfillment: 'DELIVERY' as const,
        quoteId: q.id,
      };
      const make = async () => {
        const p = await service.preview(caller, request);
        return service.create(caller, {
          previewId: p.previewId,
          idempotencyKey: randomUUID(),
          acceptTopup: false,
        });
      };
      const paid = await make(),
        unpaid = await make();
      await service.action(caller, paid.id, 'PAY', randomUUID());
      const stale = await service.preview(caller, request);
      if (stop === 'store')
        await db.store.update({
          where: { id: scope.storeId },
          data: { status: 'INACTIVE' },
        });
      else if (stop === 'product')
        await db.product.update({
          where: { id: product.id },
          data: { status: 'INACTIVE' },
        });
      else
        await db.variant.update({
          where: { id: variant.id },
          data: stop === 'soldOut' ? { soldOut: true } : { status: 'INACTIVE' },
        });
      assert.notEqual(
        (await service.preview(caller, request)).decision,
        'PASS',
      );
      await assert.rejects(
        service.create(caller, {
          previewId: stale.previewId,
          idempotencyKey: randomUUID(),
          acceptTopup: false,
        }),
      );
      await assert.rejects(
        service.action(caller, unpaid.id, 'PAY', randomUUID()),
      );
      // Inventory and explicit safety holds remain hard barriers despite the sales-only bypass.
      await db.variant.update({
        where: { id: variant.id },
        data: { reservedQuantity: 1 },
      });
      await assert.rejects(
        service.action(caller, paid.id, 'ACCEPT', randomUUID()),
        /预占异常/,
      );
      await db.variant.update({
        where: { id: variant.id },
        data: { reservedQuantity: 2 },
      });
      await db.product.update({
        where: { id: product.id },
        data: { safetyHoldReason: '食品安全召回测试' },
      });
      await assert.rejects(
        service.action(caller, paid.id, 'ACCEPT', randomUUID()),
        /安全原因/,
      );
      await db.product.update({
        where: { id: product.id },
        data: { safetyHoldReason: '' },
      });
      await db.variant.update({
        where: { id: variant.id },
        data: { deletedAt: new Date() },
      });
      await assert.rejects(
        service.action(caller, paid.id, 'ACCEPT', randomUUID()),
        /已归档/,
      );
      await db.variant.update({
        where: { id: variant.id },
        data: { deletedAt: null },
      });
      for (const action of [
        'ACCEPT',
        'READY',
        'DISPATCH',
        'DRIVER_ACCEPT',
        'DELIVERED',
      ] as const) {
        if (action !== 'ACCEPT') {
          await db.product.update({
            where: { id: product.id },
            data: { safetyHoldReason: '安全复核' },
          });
          await assert.rejects(
            service.action(caller, paid.id, action, randomUUID()),
            /安全原因/,
          );
          await db.product.update({
            where: { id: product.id },
            data: { safetyHoldReason: '' },
          });
        }
        await service.action(caller, paid.id, action, randomUUID());
      }
      await service.action(caller, paid.id, 'DELIVERED', randomUUID());
      const completed = await db.order.findUniqueOrThrow({
        where: { id: paid.id },
      });
      assert.equal(completed.orderStatus, 'COMPLETED');
      assert.equal(completed.payableFen, paid.payableFen);
      assert.deepEqual(completed.snapshot, paid.snapshot);
      assert.equal(
        (await db.variant.findUniqueOrThrow({ where: { id: variant.id } }))
          .stockQuantity,
        19,
      );
      await service.action(caller, unpaid.id, 'CANCEL', randomUUID());
      assert.equal(
        (await db.variant.findUniqueOrThrow({ where: { id: variant.id } }))
          .reservedQuantity,
        0,
      );
      await db.store.update({
        where: { id: scope.storeId },
        data: { status: 'ACTIVE' },
      });
      await db.product.update({
        where: { id: product.id },
        data: { status: 'ACTIVE' },
      });
      await db.variant.update({
        where: { id: variant.id },
        data: {
          status: 'ACTIVE',
          soldOut: false,
          stockQuantity: stockBefore.stockQuantity,
        },
      });
    }
    const dinePreview = await service.preview(caller, {
      ...checkout,
      fulfillment: 'DINE_IN',
    });
    const dine = await service.create(caller, {
      previewId: dinePreview.previewId,
      idempotencyKey: randomUUID(),
      acceptTopup: false,
    });
    for (const a of ['PAY', 'ACCEPT', 'READY', 'PICKUP'] as const)
      await service.action(caller, dine.id, a, randomUUID());
    const changedQuote = await db.mockDeliveryQuote.create({
      data: {
        ...scope,
        actor: caller.identity.id,
        distanceMeters: 3000,
        priceFen: 600,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const changedPreview = await service.preview(caller, {
      ...checkout,
      fulfillment: 'DELIVERY',
      quoteId: changedQuote.id,
    });
    const changed = await service.create(caller, {
      previewId: changedPreview.previewId,
      idempotencyKey: randomUUID(),
      acceptTopup: false,
    });
    for (const a of ['PAY', 'ACCEPT', 'READY'] as const)
      await service.action(caller, changed.id, a, randomUUID());
    const deliveryPackaging = await db.packagingConfiguration.findFirstOrThrow({
      where: { ...scope, variantId: variant.id, fulfillment: 'DELIVERY' },
    });
    await db.packagingConfiguration.delete({
      where: { id: deliveryPackaging.id },
    });
    await assert.rejects(
      service.action(caller, changed.id, 'DISPATCH', 'missing-cost'),
    );
    assert.match(
      (await db.order.findUniqueOrThrow({ where: { id: changed.id } })).issue,
      /资料不完整/,
    );
    await db.packagingConfiguration.create({ data: deliveryPackaging });
    const originalRecipe = await db.recipe.findFirstOrThrow({
      where: { ...scope, variantId: variant.id, active: true },
    });
    await db.recipe.update({
      where: { id: originalRecipe.id },
      data: { active: false },
    });
    const expensive = await db.recipe.create({
      data: {
        ...scope,
        variantId: variant.id,
        version: 2,
        otherVariableCostFen: 99999,
      },
    });
    await assert.rejects(
      service.action(caller, changed.id, 'DISPATCH', 'cost-increased'),
    );
    const blockedCount = await db.orderEvent.count({
      where: { orderId: changed.id, action: 'FULFILLMENT_BLOCKED' },
    });
    await assert.rejects(
      service.action(caller, changed.id, 'DISPATCH', 'cost-increased'),
    );
    assert.equal(
      await db.orderEvent.count({
        where: { orderId: changed.id, action: 'FULFILLMENT_BLOCKED' },
      }),
      blockedCount,
    );
    await db.recipe.delete({ where: { id: expensive.id } });
    await db.recipe.update({
      where: { id: originalRecipe.id },
      data: { active: true },
    });
    await service.requote(caller, changed.id, randomUUID(), true);
    await assert.rejects(
      service.requote(
        { ...caller, identity: { ...caller.identity, role: 'MANAGER' } },
        changed.id,
        randomUUID(),
        false,
        true,
      ),
    );
    await assert.rejects(
      service.requote(
        { ...caller, scope: other },
        changed.id,
        randomUUID(),
        false,
        true,
      ),
    );
    // Normal renewal cannot erase an increased provider quote.
    await service.requote(caller, changed.id, 'renew-increased', false, true);
    await assert.rejects(
      service.action(caller, changed.id, 'DISPATCH', randomUUID()),
    );
    await assert.rejects(
      service.action(
        { ...caller, identity: { ...caller.identity, role: 'MANAGER' } },
        changed.id,
        'RECOVER_CANCEL',
        randomUUID(),
      ),
    );
    assert.equal(
      (
        await service.action(
          caller,
          changed.id,
          'RECOVER_CANCEL',
          'recover-cancel',
        )
      ).paymentStatus,
      'REFUNDED',
    );
    await service.action(
      caller,
      changed.id,
      'RECOVER_CANCEL',
      'recover-cancel',
    );
    assert.equal(
      (await db.variant.findUniqueOrThrow({ where: { id: variant.id } }))
        .stockQuantity,
      6,
    );
    assert.equal(
      (await db.variant.findUniqueOrThrow({ where: { id: variant.id } }))
        .reservedQuantity,
      0,
    );
    await db.variant.update({
      where: { id: variant.id },
      data: { stockQuantity: 2 },
    });
    await db.orderSettings.update({
      where: { storeId: scope.storeId },
      data: { terms: defaultCheckoutTerms, revision: { increment: 1 } },
    });
    // Combined real checkout: multiple variants, modifiers, order packaging and two coupon payers.
    const extra = await db.variant.create({
      data: {
        ...scope,
        productId: product.id,
        name: '小份',
        salePriceFen: 1000,
        unlimitedStock: true,
      },
    });
    await db.recipe.create({
      data: {
        ...scope,
        variantId: extra.id,
        version: 1,
        otherVariableCostFen: 200,
      },
    });
    await db.packagingConfiguration.create({
      data: { ...scope, variantId: extra.id, fulfillment: 'PICKUP' },
    });
    const group = await db.modifierGroup.create({
      data: { ...scope, productId: product.id, name: '选项' },
    });
    const modifier = await db.modifier.create({
      data: {
        ...scope,
        groupId: group.id,
        name: '配料',
        salePriceFen: 200,
        costFen: 50,
      },
    });
    const bag = await db.packagingItem.create({
      data: { ...scope, name: '整单袋', scope: 'ORDER', unitCostFen: 80 },
    });
    await db.orderSettings.update({
      where: { storeId: scope.storeId },
      data: {
        terms: {
          ...defaultCheckoutTerms,
          orderPackaging: [{ packagingItemId: bag.id, quantity: 1 }],
          packagingRevenueFen: 100,
          merchantDiscountFen: 100,
          platformDiscountFen: 50,
          promotion: { thresholdFen: 3000, discountFen: 200 },
        },
        revision: { increment: 1 },
      },
    });
    const combo = await service.preview(caller, {
      fulfillment: 'PICKUP',
      items: [
        { variantId: variant.id, quantity: 2, modifierIds: [modifier.id] },
        { variantId: extra.id, quantity: 1, modifierIds: [] },
      ],
    });
    assert.equal(combo.decision, 'PASS');
    assert.equal(combo.goodsFen, 5380);
    assert.equal(combo.merchantDiscountFen, 300);
    assert.equal(combo.platformDiscountFen, 50);
    assert.equal(combo.payableFen, 5130);
    const comboOrder = await service.create(caller, {
      previewId: combo.previewId,
      idempotencyKey: randomUUID(),
      acceptTopup: false,
    });
    await service.action(caller, comboOrder.id, 'CANCEL', randomUUID());
    // Missing modifier cost is not an explicit zero and must block checkout.
    await db.modifier.update({
      where: { id: modifier.id },
      data: { costFen: null },
    });
    const incomplete = await service.preview(caller, {
      ...checkout,
      items: [{ ...checkout.items[0]!, modifierIds: [modifier.id] }],
    });
    assert.equal(incomplete.decision, 'MANUAL_REVIEW');
    await assert.rejects(
      service.create(caller, {
        previewId: incomplete.previewId,
        idempotencyKey: randomUUID(),
        acceptTopup: true,
      }),
    );
    await db.orderSettings.update({
      where: { storeId: scope.storeId },
      data: { terms: defaultCheckoutTerms, revision: { increment: 1 } },
    });
    const rule = await db.pricingRule.findFirstOrThrow({ where: scope });
    await db.pricingRule.update({
      where: { id: rule.id },
      data: {
        rules: {
          ...(rule.rules as Record<string, unknown>),
          minimumProfitFen: 1500,
          targetProfitFen: 1500,
          allowTopup: true,
        },
      },
    });
    const topupQuote = await db.mockDeliveryQuote.create({
      data: {
        ...scope,
        actor: caller.identity.id,
        priceFen: 600,
        distanceMeters: 3000,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const topup = await service.preview(caller, {
      ...checkout,
      fulfillment: 'DELIVERY',
      quoteId: topupQuote.id,
    });
    assert.equal(topup.decision, 'TOPUP');
    await assert.rejects(
      service.create(caller, {
        previewId: topup.previewId,
        idempotencyKey: randomUUID(),
        acceptTopup: false,
      }),
    );
    const accepted = await service.create(caller, {
      previewId: topup.previewId,
      idempotencyKey: randomUUID(),
      acceptTopup: true,
    });
    assert.equal(
      accepted.payableFen,
      topup.payableFen + topup.requiredTopupFen!,
    );
    await service.action(caller, accepted.id, 'PAY', randomUUID());
    await service.action(caller, accepted.id, 'REJECT', randomUUID());
    await db.pricingRule.update({
      where: { id: rule.id },
      data: { rules: rule.rules! },
    });
    const tokens = [0, 1, 2].map(() => randomBytes(32).toString('hex'));
    const identities = tokens.map((token, i) => ({
      token,
      id: 'http-' + i,
      merchantId,
      brandId,
      storeIds: [scope.storeId, other.storeId],
      role: ['OWNER', 'MANAGER', 'COST_MANAGER'][i],
    }));
    for (const [environment, testMode] of [
      ['production', false],
      ['test', false],
      ['test', true],
    ] as const) {
      app = await createApp(
        parseConfig({
          ...process.env,
          APP_ENV: environment,
          NODE_ENV: environment,
          TEST_MODE: String(testMode),
          ADMIN_IDENTITIES: JSON.stringify(identities),
        }),
      );
      await app.listen(0, '127.0.0.1');
      const base = (await app.getUrl()) + '/api/v1/admin';
      const call = (
        path: string,
        method = 'GET',
        body?: unknown,
        role = 0,
        store = scope.storeId,
      ) =>
        fetch(base + path, {
          method,
          headers: {
            Authorization: `Bearer ${tokens[role]}`,
            'X-Store-Id': store,
            'Content-Type': 'application/json',
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      const routes: [string, string][] = [
        [`/orders/${created.id}/requote`, 'POST'],
        ['/orders', 'GET'],
        ['/orders/menu', 'GET'],
        ['/orders/packaging', 'GET'],
        ['/orders/settings', 'GET'],
        ['/orders/settings', 'PUT'],
        ['/orders/preview', 'POST'],
        ['/orders', 'POST'],
        [`/orders/${created.id}`, 'GET'],
        [`/orders/${created.id}/actions`, 'POST'],
        ['/order-test/quotes', 'POST'],
        [`/order-test/orders/${created.id}/requote`, 'POST'],
        [`/order-test/quotes/${quote.id}/invalidate`, 'POST'],
        [`/order-test/orders/${created.id}/timeout`, 'POST'],
      ];
      for (const [path, method] of routes) {
        const denied = await call(
          path,
          method,
          method === 'GET' ? undefined : {},
          testMode ? 2 : 0,
        );
        assert.equal(
          denied.status,
          403,
          `${environment}/${testMode} ${method} ${path}`,
        );
      }
      if (testMode) {
        for (const [role, store] of [
          [2, scope.storeId],
          [0, other.storeId],
        ] as const) {
          const denied = await call(
            `/products/${product.id}`,
            'PATCH',
            { safetyHoldReason: '安全暂停' },
            role,
            store,
          );
          assert.ok(denied.status >= 400);
        }
        assert.equal(
          (
            await call(`/products/${product.id}`, 'PATCH', {
              safetyHoldReason: '安全暂停',
            })
          ).status,
          200,
        );
        assert.equal(
          (await db.product.findUniqueOrThrow({ where: { id: product.id } }))
            .safetyHoldReason,
          '安全暂停',
        );
        assert.equal(
          (
            await call(`/products/${product.id}`, 'PATCH', {
              safetyHoldReason: '',
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call(
              '/orders/settings',
              'PUT',
              { autoAccept: true, terms: defaultCheckoutTerms },
              1,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await call('/orders/settings', 'PUT', {
              autoAccept: true,
              terms: defaultCheckoutTerms,
            })
          ).status,
          200,
        );
        assert.equal(
          (
            await call(
              `/orders/${created.id}`,
              'GET',
              undefined,
              0,
              other.storeId,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await call('/orders/preview', 'POST', {
              ...checkout,
              salePriceFen: 1,
            })
          ).status,
          400,
        );
        const menu = await (
          await call('/orders/menu', 'GET', undefined, 1)
        ).json();
        assert.equal(menu[0].name, '更改后的商品');
        assert.equal(JSON.stringify(menu).includes('costFen'), false);
        const httpPreview = await (
          await call('/orders/preview', 'POST', checkout, 1)
        ).json();
        assert.equal(httpPreview.decision, 'PASS');
        const httpCreatedResponse = await call(
          '/orders',
          'POST',
          {
            previewId: httpPreview.previewId,
            idempotencyKey: randomUUID(),
            acceptTopup: false,
          },
          1,
        );
        assert.equal(httpCreatedResponse.status, 201);
        const httpCreated = await httpCreatedResponse.json();
        const httpPaid = await (
          await call(
            `/orders/${httpCreated.id}/actions`,
            'POST',
            { action: 'PAY', idempotencyKey: randomUUID() },
            1,
          )
        ).json();
        assert.equal(httpPaid.orderStatus, 'PREPARING');
        const serialized = JSON.stringify(httpPaid);
        assert.equal(serialized.includes('contributionProfitFen'), false);
        assert.equal(serialized.includes('recipeId'), false);
        assert.equal(
          (
            await call(`/variants/${variant.id}`, 'PATCH', {
              unlimitedStock: true,
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await call(`/variants/${variant.id}/stock`, 'POST', {
              delta: -2,
              reason: '测试不可挪用预占库存',
            })
          ).status,
          409,
        );
        const failurePreview = await (
          await call('/orders/preview', 'POST', checkout)
        ).json();
        const failureOrder = await (
          await call('/orders', 'POST', {
            previewId: failurePreview.previewId,
            idempotencyKey: randomUUID(),
            acceptTopup: false,
          })
        ).json();
        const failed = await (
          await call(`/orders/${failureOrder.id}/actions`, 'POST', {
            action: 'PAY_FAIL',
            idempotencyKey: randomUUID(),
          })
        ).json();
        assert.equal(failed.orderStatus, 'CANCELLED');
        assert.equal(failed.paymentStatus, 'FAILED');
        assert.equal(
          (await db.variant.findUniqueOrThrow({ where: { id: variant.id } }))
            .reservedQuantity,
          1,
        );
        const timeoutPreview = await (
          await call('/orders/preview', 'POST', checkout)
        ).json();
        const timeoutOrder = await (
          await call('/orders', 'POST', {
            previewId: timeoutPreview.previewId,
            idempotencyKey: randomUUID(),
            acceptTopup: false,
          })
        ).json();
        await db.order.update({
          where: { id: timeoutOrder.id },
          data: { expiresAt: new Date(0) },
        });
        await service.sweepExpired();
        await service.sweepExpired();
        assert.equal(
          (await db.order.findUniqueOrThrow({ where: { id: timeoutOrder.id } }))
            .orderStatus,
          'CANCELLED',
        );
        assert.equal(
          (await db.variant.findUniqueOrThrow({ where: { id: variant.id } }))
            .reservedQuantity,
          1,
        );
        assert.equal(
          await db.orderEvent.count({
            where: { orderId: timeoutOrder.id, action: 'EXPIRE' },
          }),
          1,
        );
      }
      await app.close();
      app = undefined;
    }
  } finally {
    await app?.close();
    // Disposable integration DB only: privileged cleanup is not an application archival path.
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SET LOCAL session_replication_role = 'replica'",
      );
      await tx.orderEvent.deleteMany({ where: { merchantId } });
      await tx.orderItem.deleteMany({ where: { merchantId } });
      await tx.order.deleteMany({ where: { merchantId } });
    });
    await db.checkoutPreview.deleteMany({ where: { merchantId } });
    await db.pricingRule.deleteMany({ where: { merchantId } });
    await db.recipe.deleteMany({ where: { merchantId } });
    await db.packagingConfiguration.deleteMany({ where: { merchantId } });
    await db.packagingItem.deleteMany({ where: { merchantId } });
    await db.modifier.deleteMany({ where: { merchantId } });
    await db.modifierGroup.deleteMany({ where: { merchantId } });
    await db.monthlyFixedCost.deleteMany({ where: { merchantId } });
    await db.costAllocationRule.deleteMany({ where: { merchantId } });
    await db.orderSettings.deleteMany({ where: { merchantId } });
    await db.inventoryMovement.deleteMany({ where: { merchantId } });
    await db.mockDeliveryQuote.deleteMany({ where: { merchantId } });
    await db.variant.deleteMany({ where: { merchantId } });
    await db.product.deleteMany({ where: { merchantId } });
    await db.category.deleteMany({ where: { merchantId } });
    await db.store.deleteMany({ where: { merchantId } });
    await db.brand.deleteMany({ where: { merchantId } });
    await db.merchant.deleteMany({ where: { id: merchantId } });
    await db.$disconnect();
  }
});
