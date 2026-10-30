import type { Order, Prisma } from '@prisma/client';
import { simulatePricing, type TenantScope } from '@platform/shared';
import { z } from 'zod';
import { pricingRequest, pricingRule } from './pricing.validation.js';
import { readPricing } from './pricing-reader.js';
import { reservationProblem } from './order-inventory.js';

/** Paid contracts keep their prices/rules; current costs may never silently exceed their budget. */
export async function fulfillmentProblem(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  order: Order,
  own: Record<string, number>,
) {
  const eligibility = await fulfillmentEligibility(tx, scope, order);
  if (eligibility) return eligibility;
  const evidence = z
    .object({
      pricing: z.object({
        request: pricingRequest,
        input: z.object({
          goodsFen: z.number().int(),
          variableCostFen: z.number().int(),
          fixedCostFen: z.number().int(),
          orderPackagingCostFen: z.number().int(),
        }),
      }),
      rules: pricingRule,
      acceptedTopupFen: z.number().int(),
    })
    .parse(order.evidence);
  const request = evidence.pricing.request;
  const now = new Date();
  if (order.mode === 'DELIVERY') {
    const quote = await tx.mockDeliveryQuote.findFirst({
      where: { ...scope, id: order.deliveryQuoteId ?? '', actor: order.actor },
    });
    if (!quote || quote.invalidatedAt || quote.expiresAt <= now)
      return '配送报价已到期，请老板重新询价；成交金额保持不变';
    if (
      !request.quote ||
      quote.priceFen > request.quote.priceFen ||
      quote.distanceMeters !== request.quote.distanceMeters
    )
      return '配送费用已超出成交预算，请老板处理或终止模拟退款';
    request.quote = {
      priceFen: quote.priceFen,
      distanceMeters: quote.distanceMeters,
      quotedAt: quote.createdAt.toISOString(),
      expiresAt: quote.expiresAt.toISOString(),
    };
  }
  try {
    const current = await readPricing(
      tx,
      scope,
      request,
      now,
      own,
      'PAID_FULFILLMENT',
    );
    const original = evidence.pricing.input;
    if (
      current.evidence.input.missingInputs.length ||
      current.evidence.input.blockedReasons.length
    )
      return '履约资料不完整或商品不可用，请老板核对或终止模拟退款';
    if (
      current.evidence.input.variableCostFen > original.variableCostFen ||
      current.evidence.input.fixedCostFen > original.fixedCostFen ||
      current.evidence.input.orderPackagingCostFen >
        original.orderPackagingCostFen
    )
      return '当前成本已超出成交预算，请老板核对或终止模拟退款';
    const result = simulatePricing(
      {
        ...current.evidence.input,
        goodsFen: original.goodsFen,
        customerDeliveryFeeFen:
          request.customerDeliveryFeeFen + evidence.acceptedTopupFen,
      },
      evidence.rules,
    );
    if (
      result.decision !== 'PASS' ||
      result.current.customerPaidFen !== order.payableFen
    )
      return '原成交条件下履约校验未通过，请老板核对或终止模拟退款';
    return null;
  } catch {
    return '履约资料不完整或商品不可用，请老板核对或终止模拟退款';
  }
}

/** Sales switches do not revoke a paid contract. Reservations and safety still do. */
export async function fulfillmentEligibility(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  order: Order,
) {
  const invalid = '库存预占异常，请联系老板核对';
  if (
    order.paymentStatus !== 'PAID' ||
    order.reservationStatus !== 'HELD' ||
    order.merchantId !== scope.merchantId ||
    order.brandId !== scope.brandId ||
    order.storeId !== scope.storeId
  )
    return invalid;
  const items = await tx.orderItem.findMany({
    where: { ...scope, orderId: order.id },
    include: { variant: { include: { product: true } } },
  });
  if (!items.length) return invalid;
  const reservation = await reservationProblem(tx, scope, order.id);
  if (reservation) return reservation;
  for (const item of items) {
    const v = item.variant;
    if (v.deletedAt || v.product.deletedAt)
      return '履约商品已归档，请老板核对或终止模拟退款';
    if (v.product.safetyHoldReason.trim())
      return '商品因安全原因暂停履约，请老板核对或终止模拟退款';
  }
  return null;
}
