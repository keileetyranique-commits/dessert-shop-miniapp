import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  calculateCost,
  type CostInput,
  type TenantScope,
} from '@platform/shared';
export async function readCost(
  tx: Prisma.TransactionClient,
  s: TenantScope,
  variantId: string,
  options: { month: string; fulfillment: string },
  itemsPerOrder: number | undefined,
  calculatedAt: Date,
) {
  await tx.variant.findFirstOrThrow({
    where: {
      ...s,
      id: variantId,
      deletedAt: null,
      product: { deletedAt: null },
    },
  });
  const recipe = await tx.recipe.findFirst({
    where: { ...s, variantId, active: true },
    include: {
      recipeItemRecords: {
        where: s,
        include: {
          ingredient: true,
        },
      },
    },
  });
  const purchases = new Map<
    string,
    Awaited<ReturnType<typeof tx.purchaseRecord.findFirst>>
  >();
  for (const item of recipe?.recipeItemRecords ?? []) {
    purchases.set(
      item.ingredientId,
      await tx.purchaseRecord.findFirst({
        where: {
          ...s,
          ingredientId: item.ingredientId,
          purchasedAt: { lte: calculatedAt },
        },
        orderBy: [
          { purchasedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
      }),
    );
  }
  const mapping = await tx.packagingConfiguration.findFirst({
    where: { ...s, variantId, fulfillment: options.fulfillment },
    include: {
      skuPackagingRecords: { where: s, include: { packagingItem: true } },
    },
  });
  const fixed = await tx.monthlyFixedCost.findFirst({
    where: { ...s, month: options.month },
  });
  const rule = await tx.costAllocationRule.findFirst({
    where: { ...s, month: options.month },
  });
  const input: CostInput = {
    recipePresent: !!recipe,
    packagingPresent: !!mapping,
    yieldQuantity: recipe?.yieldQuantity,
    lines:
      recipe?.recipeItemRecords.map((i) => ({
        quantity: i.quantity,
        unit: i.unit,
        baseUnit: i.ingredient.baseUnit,
        lossRateBps: i.ingredient.lossRateBps,
        purchase: purchases.get(i.ingredientId) ?? undefined,
      })) ?? [],
    packaging:
      mapping?.skuPackagingRecords.map((i) => ({
        quantity: i.quantity,
        unitCostFen: i.packagingItem.unitCostFen,
      })) ?? [],
    variable:
      recipe && rule
        ? {
            laborSeconds: recipe.laborSeconds,
            laborFenPerMinute: rule.laborFenPerMinute,
            otherFen: recipe.otherVariableCostFen,
          }
        : undefined,
    fixed:
      fixed && rule
        ? {
            totalFen:
              fixed.rentFen +
              fixed.utilitiesFen +
              fixed.payrollFen +
              fixed.propertyFeeFen +
              fixed.depreciationFen +
              fixed.softwareFen +
              fixed.otherFen,
            method: rule.method,
            expectedMonthlyItems: rule.expectedMonthlyItems,
            expectedMonthlyOrders: rule.expectedMonthlyOrders,
            itemsPerOrder,
          }
        : undefined,
  };
  let result;
  try {
    result = calculateCost(input);
  } catch {
    throw new BadRequestException('成本计算输入无效或金额超出安全整数范围');
  }
  const response = {
    ...result,
    calculatedAt: calculatedAt.toISOString(),
    month: options.month,
    fulfillment: options.fulfillment,
    recipeVersion: recipe?.version ?? null,
  };
  return {
    response,
    input,
    recipeId: recipe?.id ?? null,
    purchaseIds:
      recipe?.recipeItemRecords.map(
        (i) => purchases.get(i.ingredientId)?.id ?? null,
      ) ?? [],
    fixedCostId: fixed?.id ?? null,
    allocationRuleId: rule?.id ?? null,
  };
}
