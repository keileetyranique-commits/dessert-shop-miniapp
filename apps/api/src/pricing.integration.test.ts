import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { parseConfig } from './config.js';
test('定价使用真实成本、权限、跨租户隔离与不可变依据', async () => {
  const config = parseConfig(process.env);
  assert.equal(config.environment, 'test');
  assert.match(new URL(config.databaseUrl).pathname, /test/);
  const db = new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
  });
  const merchantId = randomUUID(),
    brandId = randomUUID();
  const scopes = [0, 1].map(() => ({
    merchantId,
    brandId,
    storeId: randomUUID(),
  }));
  const scope = scopes[0]!;
  const tokens = [0, 1, 2, 3].map(() => randomBytes(32).toString('hex'));
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    await db.merchant.create({
      data: { id: merchantId, name: '定价测试商户' },
    });
    await db.brand.create({
      data: { id: brandId, merchantId, name: '定价测试品牌' },
    });
    for (const s of scopes)
      await db.store.create({
        data: { id: s.storeId, merchantId, brandId, name: '测试门店' },
      });
    const cat = await db.category.create({ data: { ...scope, name: '分类' } });
    const product = await db.product.create({
      data: { ...scope, categoryId: cat.id, name: '通用商品' },
    });
    const variant = await db.variant.create({
      data: {
        ...scope,
        productId: product.id,
        name: '标准',
        salePriceFen: 1880,
        unlimitedStock: true,
      },
    });
    const group = await db.modifierGroup.create({
      data: { ...scope, productId: product.id, name: '选项' },
    });
    const modifier = await db.modifier.create({
      data: {
        ...scope,
        groupId: group.id,
        name: '可选附件',
        salePriceFen: 100,
      },
    });
    const pack = await db.packagingItem.create({
      data: { ...scope, name: '整单袋', scope: 'ORDER', unitCostFen: 30 },
    });
    const otherPack = await db.packagingItem.create({
      data: {
        ...scopes[1]!,
        name: '别店包装',
        scope: 'ORDER',
        unitCostFen: 30,
      },
    });
    app = await createApp(
      parseConfig({
        ...process.env,
        APP_ENV: 'production',
        NODE_ENV: 'production',
        TEST_MODE: 'false',
        ADMIN_IDENTITIES: JSON.stringify(
          tokens.map((token, i) => ({
            token,
            id: 'pricing-' + i,
            merchantId,
            brandId,
            storeIds: i === 3 ? scopes.map((s) => s.storeId) : [scope.storeId],
            role: ['OWNER', 'COST_MANAGER', 'MANAGER', 'OWNER'][i],
          })),
        ),
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
          Authorization: 'Bearer ' + tokens[role],
          'X-Store-Id': store,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const noFee = { rateBps: 0, fixedFen: 0, minimumFen: 0, capFen: null };
    const rules = {
      minimumProfitFen: 100,
      minimumMarginBps: 0,
      targetProfitFen: 300,
      targetMarginBps: 0,
      maximumDistanceMeters: 8000,
      maximumSubsidyFen: 600,
      allowTopup: true,
      payment: noFee,
      commission: noFee,
    };
    const input = {
      month: '2026-10',
      fulfillment: 'PICKUP',
      items: [
        { variantId: variant.id, quantity: 3, modifierIds: [modifier.id] },
      ],
      packagingRevenueFen: 100,
      orderPackaging: [{ packagingItemId: pack.id, quantity: 1 }],
      customerDeliveryFeeFen: 0,
      deliverySubsidyFen: 0,
      merchantDiscountFen: 100,
      platformDiscountFen: 100,
      discountBps: 0,
      promotion: null,
      quote: null,
    };
    for (const method of ['GET', 'PUT'])
      assert.equal(
        (
          await call(
            '/pricing/rules',
            method,
            method === 'PUT' ? rules : undefined,
            2,
          )
        ).status,
        403,
      );
    assert.equal(
      (await call('/pricing/simulate', 'POST', input, 2)).status,
      403,
    );
    assert.equal((await call('/pricing/rules', 'PUT', rules, 1)).status, 403);
    assert.equal((await call('/pricing/rules', 'PUT', rules)).status, 200);
    assert.equal(
      (await call('/pricing/rules', 'GET', undefined, 0, scopes[1]!.storeId))
        .status,
      403,
    );
    assert.equal(
      (
        await call('/pricing/simulate', 'POST', {
          ...input,
          minimumProfitFen: 0,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call('/pricing/simulate', 'POST', {
          ...input,
          merchantDiscountFen: 0.1,
        })
      ).status,
      400,
    );
    const partial = await (
      await call('/pricing/simulate', 'POST', input)
    ).json();
    assert.equal(partial.decision, 'MANUAL_REVIEW');
    assert.equal(partial.activityMinimumGoodsFen, null);
    assert.ok(
      partial.missingInputs.some((x: string) => x.includes('附加选项')),
    );
    await db.recipe.create({
      data: {
        ...scope,
        variantId: variant.id,
        version: 1,
        otherVariableCostFen: 420,
      },
    });
    await db.packagingConfiguration.create({
      data: { ...scope, variantId: variant.id, fulfillment: 'PICKUP' },
    });
    await db.monthlyFixedCost.create({
      data: {
        ...scope,
        month: '2026-10',
        rentFen: 100,
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
        month: '2026-10',
        method: 'ORDER',
        expectedMonthlyOrders: 1,
        expectedMonthlyItems: 3,
        laborFenPerMinute: 0,
      },
    });
    await db.modifier.update({
      where: { id: modifier.id },
      data: { costFen: 0 },
    });
    const response = await call('/pricing/simulate', 'POST', input, 1);
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.decision, 'PASS');
    assert.equal(result.current.allocatedFixedCostFen, 100);
    assert.equal(result.current.variableCostFen, 1290);
    assert.equal(result.current.merchantRevenueFen, 5940);
    assert.equal(result.evidence.lines[0].cost.recipeId.length, 36);
    assert.equal(await db.costSnapshot.count({ where: scope }), 0);
    await db.recipe.updateMany({
      where: scope,
      data: { otherVariableCostFen: 900 },
    });
    const history = await (
      await call('/pricing/simulations/' + result.simulationId)
    ).json();
    assert.equal(history.result.current.variableCostFen, 1290);
    assert.equal(
      (
        await call(
          '/pricing/simulations/' + result.simulationId,
          'GET',
          undefined,
          3,
          scopes[1]!.storeId,
        )
      ).status,
      404,
    );
    assert.equal(
      (await call('/pricing/simulate', 'POST', input, 3, scopes[1]!.storeId))
        .status,
      404,
    );
    const latestRule = await (
      await call('/pricing/rules', 'PUT', { ...rules, minimumProfitFen: 321 })
    ).json();
    assert.equal(
      (await (await call('/pricing/rules')).json()).revision,
      latestRule.revision,
    );
    assert.equal(history.inputs.rule.rules.minimumProfitFen, 100);
    assert.equal(
      (
        await call(
          '/pricing/simulations/' + result.simulationId,
          'GET',
          undefined,
          0,
          scopes[1]!.storeId,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await call('/pricing/simulate', 'POST', {
          ...input,
          orderPackaging: [{ packagingItemId: otherPack.id, quantity: 1 }],
        })
      ).status,
      404,
    );
    await db.variant.update({
      where: { id: variant.id },
      data: { unlimitedStock: false, stockQuantity: 2 },
    });
    assert.equal(
      (await (await call('/pricing/simulate', 'POST', input)).json()).decision,
      'REJECT',
    );
    await db.variant.update({
      where: { id: variant.id },
      data: { deletedAt: new Date() },
    });
    assert.equal((await call('/pricing/simulate', 'POST', input)).status, 400);
    await assert.rejects(
      db.pricingRule.create({
        data: { ...scope, brandId: randomUUID(), actor: 'test', rules },
      }),
    );
  } finally {
    if (app) await app.close();
    const where = { merchantId };
    await db.pricingSimulation.deleteMany({ where });
    await db.pricingRule.deleteMany({ where });
    await db.packagingConfiguration.deleteMany({ where });
    await db.packagingItem.deleteMany({ where });
    await db.recipe.deleteMany({ where });
    await db.modifier.deleteMany({ where });
    await db.modifierGroup.deleteMany({ where });
    await db.variant.deleteMany({ where });
    await db.product.deleteMany({ where });
    await db.category.deleteMany({ where });
    await db.costAllocationRule.deleteMany({ where });
    await db.monthlyFixedCost.deleteMany({ where });
    await db.store.deleteMany({ where });
    await db.brand.deleteMany({ where });
    await db.merchant.delete({ where: { id: merchantId } });
    await db.$disconnect();
  }
});
