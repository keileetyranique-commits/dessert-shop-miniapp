import { integer } from './cost.js';
export const PRICING_VERSION = 'pricing-v1-half-up-interval';
export interface FeeRule {
  rateBps: number;
  fixedFen: number;
  minimumFen: number;
  capFen: number | null;
}
export interface PricingRule {
  minimumProfitFen: number;
  minimumMarginBps: number;
  targetProfitFen: number;
  targetMarginBps: number;
  maximumDistanceMeters: number;
  maximumSubsidyFen: number;
  allowTopup: boolean;
  payment: FeeRule;
  commission: FeeRule;
}
export interface PricingInput {
  goodsFen: number;
  quantity: number;
  variableCostFen: number;
  fixedCostFen: number;
  packagingRevenueFen: number;
  orderPackagingCostFen: number;
  customerDeliveryFeeFen: number;
  deliverySubsidyFen: number;
  platformDiscountFen: number;
  merchantDiscountFen: number;
  discountBps: number;
  promotion: { thresholdFen: number; discountFen: number } | null;
  fulfillment: 'PICKUP' | 'DINE_IN' | 'DELIVERY';
  quote: {
    priceFen: number;
    distanceMeters: number;
    quotedAt: string;
    expiresAt: string;
  } | null;
  now: string;
  missingInputs: string[];
  blockedReasons: string[];
}
const safe = (n: bigint) => {
  const v = Number(n);
  if (!Number.isSafeInteger(v)) throw RangeError('金额超出安全范围');
  return v;
};
const half = (n: bigint, d: bigint) => safe((n + d / 2n) / d);
const sum = (...v: number[]) => safe(v.reduce((a, b) => a + BigInt(b), 0n));
const rate = (v: number) => {
  integer(v);
  if (v > 10000) throw RangeError('比例超范围');
};
export function feeFen(base: number, rule: FeeRule) {
  const n = Math.max(
    rule.minimumFen,
    sum(half(BigInt(base) * BigInt(rule.rateBps), 10000n), rule.fixedFen),
  );
  return rule.capFen === null ? n : Math.min(n, rule.capFen);
}
function amounts(
  i: PricingInput,
  r: PricingRule,
  goods = i.goodsFen,
  topup = 0,
  activity = true,
) {
  const merchantDiscountFen = activity
    ? Math.min(
        goods,
        sum(
          i.merchantDiscountFen,
          half(BigInt(goods) * BigInt(i.discountBps), 10000n),
          i.promotion && goods >= i.promotion.thresholdFen
            ? i.promotion.discountFen
            : 0,
        ),
      )
    : 0;
  const goodsReceivableFen = goods - merchantDiscountFen;
  const platformDiscountFen = activity
    ? Math.min(goodsReceivableFen, i.platformDiscountFen)
    : 0;
  const deliveryFee =
    i.fulfillment === 'DELIVERY'
      ? Math.max(0, i.customerDeliveryFeeFen - i.deliverySubsidyFen) + topup
      : 0;
  const customerPaidFen = sum(
    goodsReceivableFen - platformDiscountFen,
    i.packagingRevenueFen,
    deliveryFee,
  );
  const merchantRevenueFen = sum(customerPaidFen, platformDiscountFen);
  // Payment is charged on customer payment; commission on merchant goods receivable (including platform reimbursement).
  const paymentFeeFen = feeFen(customerPaidFen, r.payment);
  const commissionFen = feeFen(goodsReceivableFen, r.commission);
  const deliveryCostFen =
    i.fulfillment === 'DELIVERY' ? (i.quote?.priceFen ?? 0) : 0;
  const variableCostFen = sum(
    i.variableCostFen,
    i.orderPackagingCostFen,
    deliveryCostFen,
    paymentFeeFen,
    commissionFen,
  );
  const contributionProfitFen = sum(merchantRevenueFen, -variableCostFen);
  const fullCostProfitFen = sum(contributionProfitFen, -i.fixedCostFen);
  return {
    goodsFen: goods,
    goodsReceivableFen,
    merchantDiscountFen,
    platformDiscountFen,
    customerPaidFen,
    merchantRevenueFen,
    customerDeliveryFeeFen: deliveryFee,
    deliveryCostFen,
    merchantDeliveryBurdenFen: deliveryCostFen - deliveryFee,
    paymentFeeFen,
    commissionFen,
    variableCostFen,
    allocatedFixedCostFen: i.fixedCostFen,
    contributionProfitFen,
    fullCostProfitFen,
    contributionMarginBps: merchantRevenueFen
      ? safe(
          (BigInt(contributionProfitFen) * 10000n) / BigInt(merchantRevenueFen),
        )
      : null,
    fullCostMarginBps: merchantRevenueFen
      ? safe((BigInt(fullCostProfitFen) * 10000n) / BigInt(merchantRevenueFen))
      : null,
    perItemContributionFen: {
      numerator: contributionProfitFen,
      denominator: i.quantity,
    },
    perItemFullCostFen: {
      numerator: fullCostProfitFen,
      denominator: i.quantity,
    },
  };
}
type Amounts = ReturnType<typeof amounts>;
function meets(a: Amounts, profit: number, margin: number, full = false) {
  const p = full ? a.fullCostProfitFen : a.contributionProfitFen;
  return (
    p >= profit &&
    BigInt(p) * 10000n >= BigInt(a.merchantRevenueFen) * BigInt(margin)
  );
}
// Exact left-first interval search. Within each promotion segment, revenue and fees are monotone,
// but profit need not be (independent fee rounding). Bounding avoids an unsafe binary search.
function findPrice(
  i: PricingInput,
  r: PricingRule,
  activity: boolean,
  full: boolean,
) {
  const profit = full ? r.targetProfitFen : r.minimumProfitFen;
  const margin = full ? r.targetMarginBps : r.minimumMarginBps;
  let budget = 20000;
  const scan = (lo: number, hi: number): number | null => {
    if (--budget < 0) throw Error('SEARCH_LIMIT');
    const a = amounts(i, r, lo, 0, activity),
      b = amounts(i, r, hi, 0, activity);
    const upperProfit = sum(
      b.merchantRevenueFen,
      -a.variableCostFen,
      full ? -i.fixedCostFen : 0,
    );
    const upperContribution = sum(b.merchantRevenueFen, -a.variableCostFen);
    if (
      upperContribution < r.minimumProfitFen ||
      BigInt(upperContribution) * 10000n <
        BigInt(a.merchantRevenueFen) * BigInt(r.minimumMarginBps)
    )
      return null;
    if (
      upperProfit < profit ||
      BigInt(upperProfit) * 10000n <
        BigInt(a.merchantRevenueFen) * BigInt(margin)
    )
      return null;
    if (
      meets(a, profit, margin, full) &&
      meets(a, r.minimumProfitFen, r.minimumMarginBps)
    )
      return lo;
    if (lo === hi) return null;
    const mid = lo + Math.floor((hi - lo) / 2);
    return scan(lo, mid) ?? scan(mid + 1, hi);
  };
  const threshold = activity ? i.promotion?.thresholdFen : undefined;
  const max = 2147483647;
  if (threshold !== undefined && threshold > 0 && threshold <= max)
    return scan(0, threshold - 1) ?? scan(threshold, max);
  return scan(0, max);
}
export function simulatePricing(i: PricingInput, r: PricingRule) {
  for (const [k, v] of Object.entries(i))
    if (typeof v === 'number') integer(v, k === 'quantity' ? 1 : 0);
  rate(i.discountBps);
  for (const [k, v] of Object.entries(r))
    if (typeof v === 'number') {
      integer(v);
      if (k.endsWith('Bps')) rate(v);
    }
  for (const fee of [r.payment, r.commission]) {
    rate(fee.rateBps);
    integer(fee.fixedFen);
    integer(fee.minimumFen);
    if (fee.capFen !== null) {
      integer(fee.capFen);
      if (fee.capFen < fee.minimumFen) throw RangeError('封顶低于最低费用');
    }
  }
  if (i.promotion) {
    integer(i.promotion.thresholdFen);
    integer(i.promotion.discountFen);
  }
  if (i.quote) {
    integer(i.quote.priceFen);
    integer(i.quote.distanceMeters);
  }
  if (!Number.isFinite(Date.parse(i.now))) throw RangeError('计算时间无效');
  const missingInputs = [...i.missingInputs],
    blockedReasons = [...i.blockedReasons];
  if (i.fulfillment === 'DELIVERY') {
    const q = i.quote;
    if (
      !q ||
      !Number.isFinite(Date.parse(q.quotedAt)) ||
      !Number.isFinite(Date.parse(q.expiresAt)) ||
      Date.parse(q.quotedAt) > Date.parse(i.now) ||
      Date.parse(q.expiresAt) <= Date.parse(i.now) ||
      Date.parse(q.expiresAt) - Date.parse(q.quotedAt) > 15 * 60000
    )
      missingInputs.push('配送报价缺失、过期或有效期超过十五分钟');
    if (q && q.distanceMeters > r.maximumDistanceMeters)
      blockedReasons.push('超出门店配送范围');
    if (i.deliverySubsidyFen > i.customerDeliveryFeeFen)
      throw RangeError('配送优惠不能高于顾客配送费');
  }
  const current = amounts(i, r),
    ordinary = amounts(i, r, i.goodsFen, 0, false);
  let minimumSafeGoodsFen: number | null = null,
    activityMinimumGoodsFen: number | null = null,
    recommendedGoodsFen: number | null = null;
  const warnings: string[] = [];
  if (!missingInputs.length) {
    try {
      minimumSafeGoodsFen = findPrice(i, r, false, false);
      activityMinimumGoodsFen = findPrice(i, r, true, false);
      recommendedGoodsFen = findPrice(i, r, true, true);
    } catch (e) {
      if (!(e instanceof Error) || e.message !== 'SEARCH_LIMIT') throw e;
      warnings.push('价格搜索复杂度超限，请人工复核底价');
    }
  }
  const acceptable = (a: Amounts) =>
    meets(a, r.minimumProfitFen, r.minimumMarginBps) &&
    (i.fulfillment !== 'DELIVERY' ||
      a.merchantDeliveryBurdenFen <= r.maximumSubsidyFen);
  let decision: 'PASS' | 'TOPUP' | 'REJECT' | 'MANUAL_REVIEW' = 'REJECT';
  let requiredTopupFen: number | null = null;
  if (blockedReasons.length) decision = 'REJECT';
  else if (missingInputs.length) decision = 'MANUAL_REVIEW';
  else if (acceptable(current)) decision = 'PASS';
  else if (r.allowTopup && i.fulfillment === 'DELIVERY' && i.quote) {
    // Topup changes payment fee only. Rate <=100% means profit and the margin predicate
    // may still have tiny rounding steps; exhaustive cents are bounded to the unpaid delivery quote.
    const maximum = Math.max(
      0,
      i.quote.priceFen - current.customerDeliveryFeeFen,
    );
    if (maximum > 100000) warnings.push('补差范围超限，请人工确认');
    else
      for (let n = 1; n <= maximum; n++)
        if (acceptable(amounts(i, r, i.goodsFen, n))) {
          requiredTopupFen = n;
          decision = 'TOPUP';
          break;
        }
  }
  if (warnings.length && decision !== 'REJECT') decision = 'MANUAL_REVIEW';
  return {
    calculationVersion: PRICING_VERSION,
    calculatedAt: i.now,
    decision,
    requiredTopupFen,
    current,
    ordinary,
    minimumSafeGoodsFen,
    activityMinimumGoodsFen,
    recommendedGoodsFen,
    missingInputs,
    blockedReasons,
    warnings,
    complete: missingInputs.length === 0,
    rounding:
      '费用逐项四舍五入到分；利润率向零截断显示，门槛按整数交叉相乘校验；每份金额保留分数口径',
    priceBasis:
      '本次整单商品（含附加选项）应收总价，保持数量和成本不变；不自动改商品售价',
  };
}
