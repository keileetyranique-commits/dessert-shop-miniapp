import { createRequire } from 'node:module';
const require = createRequire(
  new URL('../apps/api/package.json', import.meta.url),
);
const { PrismaClient } = require('@prisma/client');
if (
  process.env.APP_ENV !== 'development' ||
  process.env.TEST_MODE !== 'true' ||
  !new URL(process.env.DATABASE_URL).pathname.includes('development')
)
  throw new Error('演示准备仅允许本地开发数据库和服务端测试模式');
const identity = JSON.parse(process.env.ADMIN_IDENTITIES ?? '[]').find(
  (i) => i.role === 'OWNER' && i.storeIds === '*',
);
if (!identity) throw new Error('需要已配置的本地老板身份');
const db = new PrismaClient();
try {
  const tenant = { merchantId: identity.merchantId, brandId: identity.brandId };
  const store =
    (await db.store.findFirst({
      where: { ...tenant, name: 'Phase 3 流程验收门店' },
    })) ??
    (await db.store.create({
      data: { ...tenant, name: 'Phase 3 流程验收门店' },
    }));
  const scope = { ...tenant, storeId: store.id };
  const category =
    (await db.category.findFirst({
      where: { ...scope, name: '流程验收商品' },
    })) ??
    (await db.category.create({ data: { ...scope, name: '流程验收商品' } }));
  for (const [name, price] of [
    ['红豆甜品（测试）', 1880],
    ['清爽茶饮（测试）', 1200],
  ]) {
    const product =
      (await db.product.findFirst({ where: { ...scope, name } })) ??
      (await db.product.create({
        data: {
          ...scope,
          categoryId: category.id,
          name,
          description: '仅供模拟订单验收，不用于真实销售。',
        },
      }));
    const variant =
      (await db.variant.findFirst({
        where: { ...scope, productId: product.id },
      })) ??
      (await db.variant.create({
        data: {
          ...scope,
          productId: product.id,
          name: '标准份',
          salePriceFen: price,
          stockQuantity: 100,
        },
      }));
    if (
      !(await db.recipe.findFirst({
        where: { ...scope, variantId: variant.id },
      }))
    )
      await db.recipe.create({
        data: {
          ...scope,
          variantId: variant.id,
          version: 1,
          otherVariableCostFen: 300,
        },
      });
    for (const fulfillment of ['PICKUP', 'DINE_IN', 'DELIVERY'])
      if (
        !(await db.packagingConfiguration.findFirst({
          where: { ...scope, variantId: variant.id, fulfillment },
        }))
      )
        await db.packagingConfiguration.create({
          data: { ...scope, variantId: variant.id, fulfillment },
        });
    const group =
      (await db.modifierGroup.findFirst({
        where: { ...scope, productId: product.id },
      })) ??
      (await db.modifierGroup.create({
        data: { ...scope, productId: product.id, name: '口味选项' },
      }));
    if (
      !(await db.modifier.findFirst({ where: { ...scope, groupId: group.id } }))
    )
      await db.modifier.create({
        data: {
          ...scope,
          groupId: group.id,
          name: '椰乳',
          salePriceFen: 200,
          costFen: 50,
        },
      });
  }
  const month = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date());
  if (!(await db.monthlyFixedCost.findFirst({ where: { ...scope, month } })))
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
  if (!(await db.costAllocationRule.findFirst({ where: { ...scope, month } })))
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
  if (!(await db.pricingRule.findFirst({ where: scope })))
    await db.pricingRule.create({
      data: {
        ...scope,
        actor: identity.id,
        rules: {
          minimumProfitFen: 100,
          minimumMarginBps: 0,
          targetProfitFen: 100,
          targetMarginBps: 0,
          maximumDistanceMeters: 8000,
          maximumSubsidyFen: 0,
          allowTopup: true,
          payment: noFee,
          commission: noFee,
        },
      },
    });
  if (
    !(await db.packagingItem.findFirst({ where: { ...scope, scope: 'ORDER' } }))
  )
    await db.packagingItem.create({
      data: { ...scope, scope: 'ORDER', name: '测试整单袋', unitCostFen: 80 },
    });
  if (!(await db.orderSettings.findFirst({ where: scope })))
    await db.orderSettings.create({
      data: {
        ...scope,
        actor: identity.id,
        autoAccept: false,
        terms: {
          packagingRevenueFen: 0,
          orderPackaging: [],
          customerDeliveryFeeFen: 0,
          deliverySubsidyFen: 0,
          merchantDiscountFen: 0,
          platformDiscountFen: 0,
          discountBps: 0,
          promotion: null,
        },
      },
    });
  console.log(
    '已准备：Phase 3 流程验收门店。数据明确为测试夹具；没有创建或完成任何订单。',
  );
} finally {
  await db.$disconnect();
}
