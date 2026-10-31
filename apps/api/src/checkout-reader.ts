import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { simulatePricing, type TenantScope } from '@platform/shared';
import { z } from 'zod';
import { checkoutInput, requestFingerprint } from './order-security.js';
import { pricingRequest } from './pricing.validation.js';
import { readPricing } from './pricing-reader.js';

export const checkoutTerms = pricingRequest.omit({
  month: true,
  fulfillment: true,
  items: true,
  quote: true,
});
export const defaultCheckoutTerms: z.input<typeof checkoutTerms> = {
  packagingRevenueFen: 0,
  orderPackaging: [],
  customerDeliveryFeeFen: 0,
  deliverySubsidyFen: 0,
  merchantDiscountFen: 0,
  platformDiscountFen: 0,
  discountBps: 0,
  promotion: null,
};
export type CheckoutRequest = z.infer<typeof checkoutInput>;
export const jsonValue = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

/** Never return this function's private evidence to an ordinary checkout/POS caller. */
export async function readCheckout(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  actor: string,
  request: CheckoutRequest,
  acceptTopup = false,
  ownReservations: Readonly<Record<string, number>> = {},
) {
  const now = new Date();
  const settings = await tx.orderSettings.findUnique({
    where: { storeId: scope.storeId },
  });
  const terms = checkoutTerms.parse(settings?.terms ?? defaultCheckoutTerms);
  const quote =
    request.fulfillment === 'DELIVERY' && request.quoteId
      ? await tx.mockDeliveryQuote.findFirst({
          where: {
            ...scope,
            id: request.quoteId,
            actor,
            invalidatedAt: null,
            expiresAt: { gt: now },
          },
        })
      : null;
  if (request.fulfillment === 'DELIVERY' && !quote)
    throw new ConflictException('配送报价已失效，请重新获取报价');
  const month = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
  }).format(now);
  const pricing = await readPricing(
    tx,
    scope,
    {
      ...terms,
      month,
      fulfillment: request.fulfillment,
      items: request.items,
      quote: quote
        ? {
            priceFen: quote.priceFen,
            distanceMeters: quote.distanceMeters,
            quotedAt: quote.createdAt.toISOString(),
            expiresAt: quote.expiresAt.toISOString(),
          }
        : null,
    },
    now,
    ownReservations,
  );
  if (!settings)
    pricing.evidence.input.missingInputs.push('门店结算设置尚未确认');
  const baseResult = simulatePricing(pricing.evidence.input, pricing.rules);
  const topupFen =
    baseResult.decision === 'TOPUP' && acceptTopup
      ? (baseResult.requiredTopupFen ?? 0)
      : 0;
  const result = topupFen
    ? simulatePricing(
        {
          ...pricing.evidence.input,
          customerDeliveryFeeFen:
            pricing.evidence.input.customerDeliveryFeeFen + topupFen,
        },
        pricing.rules,
      )
    : baseResult;
  const lines = pricing.evidence.lines.map((line) => ({
    variantId: line.variant.id,
    productName: line.variant.product.name,
    variantName: line.variant.name,
    quantity: line.quantity,
    salePriceFen: line.variant.salePriceFen,
    imageUrl: line.variant.product.imageUrl,
    modifiers: line.modifiers.map((m) => ({
      id: m.id,
      name: m.name,
      salePriceFen: m.salePriceFen,
    })),
  }));
  // Availability is checked each time, not fingerprinted: other buyers' reservations must not invalidate a quote.
  const fingerprint = requestFingerprint({
    settingsRevision: settings?.revision ?? null,
    ruleId: pricing.evidence.rule?.id ?? null,
    terms,
    month,
    quote: quote
      ? { priceFen: quote.priceFen, distanceMeters: quote.distanceMeters }
      : null,
    lines,
    costs: pricing.evidence.lines.map((line) => ({
      input: line.cost.input,
      recipeId: line.cost.recipeId,
      purchaseIds: line.cost.purchaseIds,
      fixedCostId: line.cost.fixedCostId,
      allocationRuleId: line.cost.allocationRuleId,
      modifierCosts: line.modifiers.map((m) => ({
        id: m.id,
        costFen: m.costFen,
      })),
    })),
    packaging: pricing.evidence.packaging,
  });
  const current = result.current;
  const publicResult = {
    decision: result.decision,
    requiredTopupFen: result.requiredTopupFen,
    acceptedTopupFen: topupFen,
    message:
      result.decision === 'PASS'
        ? '可继续结算'
        : result.decision === 'TOPUP'
          ? '需确认补付配送费用'
          : result.decision === 'MANUAL_REVIEW'
            ? '门店资料或报价需要核对，暂不能结算'
            : '当前订单暂不能接单，请调整商品或联系门店',
    goodsFen: current.goodsFen,
    merchantDiscountFen: current.merchantDiscountFen,
    platformDiscountFen: current.platformDiscountFen,
    packagingRevenueFen: terms.packagingRevenueFen,
    customerDeliveryFeeFen: current.customerDeliveryFeeFen,
    payableFen: current.customerPaidFen,
    fulfillment: request.fulfillment,
    lines,
  };
  if (
    !Number.isInteger(publicResult.payableFen) ||
    publicResult.payableFen > 2147483647
  )
    throw new ConflictException('订单金额超过支持范围，请分单');
  return {
    publicResult,
    fingerprint,
    settings,
    evidence: {
      pricing: pricing.evidence,
      result,
      rules: pricing.rules,
      acceptedTopupFen: topupFen,
    },
  };
}
