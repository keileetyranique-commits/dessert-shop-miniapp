import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  simulatePricing,
  type PricingInput,
  type PricingRule,
} from './pricing.js';
export const rule: PricingRule = {
  minimumProfitFen: 100,
  minimumMarginBps: 0,
  targetProfitFen: 300,
  targetMarginBps: 0,
  maximumDistanceMeters: 8000,
  maximumSubsidyFen: 600,
  allowTopup: true,
  payment: { rateBps: 0, fixedFen: 0, minimumFen: 0, capFen: null },
  commission: { rateBps: 0, fixedFen: 0, minimumFen: 0, capFen: null },
};
export function sample(): PricingInput {
  return {
    goodsFen: 1880,
    quantity: 1,
    variableCostFen: 420,
    fixedCostFen: 100,
    packagingRevenueFen: 0,
    orderPackagingCostFen: 0,
    customerDeliveryFeeFen: 0,
    deliverySubsidyFen: 0,
    platformDiscountFen: 0,
    merchantDiscountFen: 0,
    discountBps: 0,
    promotion: null,
    fulfillment: 'PICKUP',
    quote: null,
    now: '2026-10-16T08:00:00.000Z',
    missingInputs: [],
    blockedReasons: [],
  };
}
describe('确定性定价', () => {
  it('多费用舍入与满减的底价和逐分穷举一致', () => {
    for (const seed of [1, 2, 3, 7, 11, 19]) {
      const i = {
        ...sample(),
        variableCostFen: 30,
        fixedCostFen: 10,
        merchantDiscountFen: seed,
        discountBps: seed * 53,
        promotion: { thresholdFen: 70, discountFen: 40 },
      };
      const r = {
        ...rule,
        minimumProfitFen: 5,
        minimumMarginBps: 1200,
        targetProfitFen: 0,
        targetMarginBps: 0,
        payment: { rateBps: 1900, fixedFen: 1, minimumFen: 2, capFen: 80 },
        commission: { rateBps: 1700, fixedFen: 2, minimumFen: 0, capFen: null },
      };
      const result = simulatePricing(i, r);
      let expected: number | null = null;
      for (let price = 0; price <= 1000; price++) {
        const discount = Math.min(
          price,
          seed +
            Math.floor((price * i.discountBps + 5000) / 10000) +
            (price >= 70 ? 40 : 0),
        );
        const revenue = price - discount;
        const payment = Math.min(
          80,
          Math.max(2, Math.floor((revenue * 1900 + 5000) / 10000) + 1),
        );
        const commission = Math.floor((revenue * 1700 + 5000) / 10000) + 2;
        const profit = revenue - 30 - payment - commission;
        if (profit >= 5 && profit * 10000 >= revenue * 1200) {
          expected = price;
          break;
        }
      }
      assert.equal(result.activityMinimumGoodsFen, expected);
      assert.ok(result.recommendedGoodsFen! >= result.activityMinimumGoodsFen!);
    }
  });
  it('贡献与全成本、普通底线与活动价均可复算', () => {
    const r = simulatePricing(sample(), rule);
    assert.equal(r.current.contributionProfitFen, 1460);
    assert.equal(r.current.fullCostProfitFen, 1360);
    assert.equal(r.minimumSafeGoodsFen, 520);
    assert.equal(r.recommendedGoodsFen, 820);
    assert.equal(r.decision, 'PASS');
    assert.deepEqual(simulatePricing(sample(), rule), r);
  });
  for (const distanceMeters of [3000, 5000, 8000])
    it('配送 ' + distanceMeters + ' 米包含顾客费用与补贴且不重复扣款', () => {
      const i = sample();
      i.fulfillment = 'DELIVERY';
      i.quote = {
        priceFen: distanceMeters / 10,
        distanceMeters,
        quotedAt: i.now,
        expiresAt: '2026-10-16T08:05:00.000Z',
      };
      i.customerDeliveryFeeFen = 300;
      i.deliverySubsidyFen = 100;
      const r = simulatePricing(i, rule);
      assert.equal(r.current.contributionProfitFen, 1660 - distanceMeters / 10);
    });
  it('商家券减收入、平台券由第三方补齐，不重复扣优惠', () => {
    const i = {
      ...sample(),
      merchantDiscountFen: 300,
      platformDiscountFen: 200,
    };
    const r = simulatePricing(i, rule);
    assert.equal(r.current.customerPaidFen, 1380);
    assert.equal(r.current.merchantRevenueFen, 1580);
    assert.equal(r.current.contributionProfitFen, 1160);
  });
  it('门槛处不单调，底价必须是全局最小有效值', () => {
    const i = {
      ...sample(),
      promotion: { thresholdFen: 600, discountFen: 500 },
    };
    const r = simulatePricing(i, { ...rule, minimumProfitFen: 150 });
    assert.equal(r.activityMinimumGoodsFen, 570);
    assert.equal(r.current.merchantDiscountFen, 500);
  });
  it('两种费用分别四舍五入、最小收费和封顶', () => {
    const r = simulatePricing(
      { ...sample(), goodsFen: 101 },
      {
        ...rule,
        payment: { rateBps: 5000, fixedFen: 2, minimumFen: 60, capFen: 65 },
        commission: { rateBps: 1000, fixedFen: 0, minimumFen: 0, capFen: 5 },
      },
    );
    assert.equal(r.current.paymentFeeFen, 60);
    assert.equal(r.current.commissionFen, 5);
  });
  it('资料缺失不能以已知部分自动判盈利，明确零成本可通过', () => {
    assert.equal(
      simulatePricing(
        { ...sample(), missingInputs: ['附加选项成本未配置'] },
        rule,
      ).decision,
      'MANUAL_REVIEW',
    );
    assert.equal(
      simulatePricing({ ...sample(), missingInputs: ['配方未配置'] }, rule)
        .minimumSafeGoodsFen,
      null,
    );
    assert.equal(
      simulatePricing({ ...sample(), variableCostFen: 0 }, rule).decision,
      'PASS',
    );
  });
  it('报价缺失或过期必须人工确认；超半径和不可售不可补钱绕过', () => {
    const i = { ...sample(), fulfillment: 'DELIVERY' as const };
    assert.equal(simulatePricing(i, rule).decision, 'MANUAL_REVIEW');
    i.quote = {
      priceFen: 100,
      distanceMeters: 8001,
      quotedAt: i.now,
      expiresAt: '2026-10-16T08:05:00.000Z',
    };
    assert.equal(simulatePricing(i, rule).decision, 'REJECT');
    i.quote.distanceMeters = 1000;
    i.quote.expiresAt = i.now;
    assert.equal(simulatePricing(i, rule).decision, 'MANUAL_REVIEW');
    assert.equal(
      simulatePricing({ ...sample(), blockedReasons: ['库存不足'] }, rule)
        .decision,
      'REJECT',
    );
  });
  it('补差必须再次满足金额和比例，只能补配送未承担部分', () => {
    const i = {
      ...sample(),
      goodsFen: 600,
      fulfillment: 'DELIVERY' as const,
      quote: {
        priceFen: 800,
        distanceMeters: 5000,
        quotedAt: sample().now,
        expiresAt: '2026-10-16T08:05:00.000Z',
      },
    };
    const r = simulatePricing(i, rule);
    assert.equal(r.decision, 'TOPUP');
    assert.equal(r.requiredTopupFen, 720);
    assert.equal(
      simulatePricing({ ...i, customerDeliveryFeeFen: 720 }, rule).decision,
      'PASS',
    );
    assert.equal(
      simulatePricing({ ...i, goodsFen: 100 }, rule).decision,
      'REJECT',
    );
  });
  it('零金额不除零，小数、负值、上溢拒绝', () => {
    assert.equal(
      simulatePricing({ ...sample(), goodsFen: 0 }, rule).current
        .contributionMarginBps,
      null,
    );
    for (const goodsFen of [0.1, -1, Number.MAX_SAFE_INTEGER + 1])
      assert.throws(() => simulatePricing({ ...sample(), goodsFen }, rule));
  });
});
