import type { Order, Prisma } from '@prisma/client';
import { simulatePricing, type TenantScope } from '@platform/shared';
import { z } from 'zod';
import { pricingRequest, pricingRule } from './pricing.validation.js';
import { readPricing } from './pricing-reader.js';

/** Paid contracts keep their prices/rules; current costs may never silently exceed their budget. */
export async function fulfillmentProblem(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  order: Order,
  own: Record<string, number>,
) {
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
    const current = await readPricing(tx, scope, request, now, own);
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
