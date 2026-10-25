import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  simulatePricing,
  type PricingRule,
  type PricingInput,
  type TenantScope,
} from '@platform/shared';
import { z } from 'zod';
import { parse } from './validation.js';
import { pricingRequest, pricingRule } from './pricing.validation.js';
import { readCost } from './cost-reader.js';

/** Internal trusted reader; callers must authorize and construct checkout inputs on the server. */
export async function readPricing(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  request: z.input<typeof pricingRequest>,
  now = new Date(),
  ownReservations: Readonly<Record<string, number>> = {},
) {
  if (
    new Set(request.items.map((i) => i.variantId)).size !== request.items.length
  )
    throw new BadRequestException('同一规格请合并数量');
  const rule = await tx.pricingRule.findFirst({
    where: scope,
    orderBy: { revision: 'desc' },
  });
  const store = await tx.store.findFirstOrThrow({
    where: {
      id: scope.storeId,
      merchantId: scope.merchantId,
      brandId: scope.brandId,
      deletedAt: null,
    },
  });
  const missingInputs: string[] = [],
    blockedReasons: string[] = [];
  if (!rule) missingInputs.push('请老板先保存利润保护设置');
  if (store.status !== 'ACTIVE') blockedReasons.push('门店已停用');
  const totalQuantity = request.items.reduce((a, i) => a + i.quantity, 0);
  let goods = 0n,
    variable = 0n,
    fixed = 0n;
  const lines = [];
  for (const item of request.items) {
    const variant = await tx.variant.findFirstOrThrow({
      where: { ...scope, id: item.variantId },
      include: {
        product: {
          include: {
            modifierGroupRecords: {
              where: scope,
              include: { modifierRecords: { where: scope } },
            },
          },
        },
      },
    });
    if (variant.deletedAt || variant.product.deletedAt)
      throw new BadRequestException('商品或规格已归档，请重新选择');
    if (
      variant.status !== 'ACTIVE' ||
      variant.product.status !== 'ACTIVE' ||
      variant.soldOut
    )
      blockedReasons.push(`${variant.product.name}不可售`);
    if (
      !variant.unlimitedStock &&
      variant.stockQuantity -
        variant.reservedQuantity +
        (ownReservations[variant.id] ?? 0) <
        item.quantity
    )
      blockedReasons.push(`${variant.product.name}库存不足`);
    const cost = await readCost(
      tx,
      scope,
      variant.id,
      request,
      totalQuantity,
      now,
    );
    missingInputs.push(
      ...cost.response.missingInputs.map(
        (x) => `${variant.product.name} / ${variant.name}：${x}`,
      ),
    );
    const selected = new Set(item.modifierIds);
    if (selected.size !== (item.modifierIds ?? []).length)
      throw new BadRequestException('附加选项不能重复');
    const modifiers = [];
    for (const group of variant.product.modifierGroupRecords) {
      const chosen = group.modifierRecords.filter((m) => selected.has(m.id));
      if (
        group.status === 'ACTIVE' &&
        (chosen.length < group.minSelections ||
          chosen.length > group.maxSelections)
      )
        throw new BadRequestException('附加选项数量不符合商品要求');
      for (const m of chosen) {
        if (group.status !== 'ACTIVE' || m.status !== 'ACTIVE')
          throw new BadRequestException('附加选项已停用');
        selected.delete(m.id);
        modifiers.push(m);
        if (m.costFen === null)
          missingInputs.push(`${m.name}：附加选项成本未配置`);
        variable += BigInt(m.costFen ?? 0) * BigInt(item.quantity);
        goods += BigInt(m.salePriceFen) * BigInt(item.quantity);
      }
    }
    if (selected.size)
      throw new BadRequestException('附加选项不属于当前商品或门店');
    goods +=
      BigInt(item.salePriceFen ?? variant.salePriceFen) * BigInt(item.quantity);
    variable +=
      BigInt(
        cost.response.ingredientCostFen +
          cost.response.packagingCostFen +
          cost.response.variableCostFen,
      ) * BigInt(item.quantity);
    // ORDER allocation is rounded once for the whole order, not once per item then multiplied back.
    if (cost.input.fixed?.method === 'ITEM')
      fixed +=
        BigInt(cost.response.allocatedFixedCostFen) * BigInt(item.quantity);
    lines.push({
      variant,
      quantity: item.quantity,
      simulatedPriceFen: item.salePriceFen ?? variant.salePriceFen,
      modifiers,
      cost,
    });
  }
  const firstFixed = lines[0]?.cost.input.fixed;
  if (firstFixed?.method === 'ORDER')
    fixed =
      (BigInt(firstFixed.totalFen) +
        BigInt(firstFixed.expectedMonthlyOrders) / 2n) /
      BigInt(firstFixed.expectedMonthlyOrders);
  let packagingCost = 0n;
  const packaging = [];
  if (
    new Set(request.orderPackaging.map((p) => p.packagingItemId)).size !==
    request.orderPackaging.length
  )
    throw new BadRequestException('整单包装不能重复');
  for (const p of request.orderPackaging) {
    const asset = await tx.packagingItem.findFirstOrThrow({
      where: {
        ...scope,
        id: p.packagingItemId,
        scope: 'ORDER',
        status: 'ACTIVE',
        deletedAt: null,
      },
    });
    packagingCost += BigInt(asset.unitCostFen) * BigInt(p.quantity);
    packaging.push({ ...asset, quantity: p.quantity });
  }
  const safe = (v: bigint) => {
    const n = Number(v);
    if (!Number.isSafeInteger(n))
      throw new BadRequestException('金额超出安全计算范围');
    return n;
  };
  const input: PricingInput = {
    ...request,
    goodsFen: safe(goods),
    quantity: totalQuantity,
    variableCostFen: safe(variable),
    fixedCostFen: safe(fixed),
    orderPackagingCostFen: safe(packagingCost),
    now: now.toISOString(),
    missingInputs,
    blockedReasons,
  };
  const evidence = { input, rule, lines, packaging, request };
  const noFee = { rateBps: 0, fixedFen: 0, minimumFen: 0, capFen: null };
  const rules: PricingRule = evidence.rule
    ? parse(pricingRule, evidence.rule.rules)
    : {
        minimumProfitFen: 0,
        minimumMarginBps: 0,
        targetProfitFen: 0,
        targetMarginBps: 0,
        maximumDistanceMeters: 1000000,
        maximumSubsidyFen: 0,
        allowTopup: false,
        payment: noFee,
        commission: noFee,
      };
  let result;
  try {
    result = simulatePricing(evidence.input, rules);
  } catch {
    throw new BadRequestException(
      '定价输入无效或金额超出安全范围，请检查费用与优惠',
    );
  }
  return { evidence, rules, result };
}
