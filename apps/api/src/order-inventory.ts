import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TenantScope } from '@platform/shared';
import { z } from 'zod';

const reservedBasis = z.object({
  pricing: z.object({
    lines: z
      .array(
        z.object({
          quantity: z.number().int().positive(),
          variant: z.object({
            id: z.string().uuid(),
            productId: z.string().uuid(),
            unlimitedStock: z.boolean(),
          }),
        }),
      )
      .min(1),
  }),
});

/** The immutable order items + HELD state are the per-order reservation ledger.
 * Caller holds the order lock in its Serializable transaction. Lock inventory in stable order
 * and reconcile the entire ledger, never infer reservations from sellable stock or clamp releases.
 */
export async function reservationProblem(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  orderId: string,
) {
  const invalid = '库存预占异常，请联系老板核对';
  const order = await tx.order.findFirst({
    where: { ...scope, id: orderId },
    include: { items: true },
  });
  if (!order || order.reservationStatus !== 'HELD') return invalid;
  const basis = reservedBasis.safeParse(order.evidence);
  if (!basis.success || basis.data.pricing.lines.length !== order.items.length)
    return invalid;
  const lines = new Map(basis.data.pricing.lines.map((l) => [l.variant.id, l]));
  if (lines.size !== order.items.length) return invalid;
  for (const item of [...order.items].sort((a, b) =>
    a.variantId.localeCompare(b.variantId),
  )) {
    const line = lines.get(item.variantId);
    if (
      !line ||
      item.merchantId !== scope.merchantId ||
      item.brandId !== scope.brandId ||
      item.storeId !== scope.storeId ||
      item.quantity !== line.quantity ||
      item.finiteStock === line.variant.unlimitedStock
    )
      return invalid;
    const rows = await tx.$queryRaw<
      { productId: string; reservedQuantity: number; stockQuantity: number }[]
    >(Prisma.sql`
      SELECT "productId", "reservedQuantity", "stockQuantity" FROM variants
      WHERE id = ${item.variantId}::uuid AND "merchantId" = ${scope.merchantId}::uuid
        AND "brandId" = ${scope.brandId}::uuid AND "storeId" = ${scope.storeId}::uuid FOR UPDATE
    `);
    const variant = rows[0];
    if (!variant || variant.productId !== line.variant.productId)
      return invalid;
    const held = await tx.orderItem.aggregate({
      where: {
        ...scope,
        variantId: item.variantId,
        finiteStock: true,
        order: { ...scope, reservationStatus: 'HELD' },
      },
      _sum: { quantity: true },
    });
    const expected = held._sum.quantity ?? 0;
    if (
      variant.reservedQuantity !== expected ||
      variant.stockQuantity < expected
    )
      return invalid;
  }
  return null;
}

export interface ReservedItem {
  variantId: string;
  quantity: number;
  finiteStock: boolean;
}

/** Called inside the order transaction. Stable lock order prevents opposite-cart deadlocks. */
export async function reserveInventory(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  items: { variantId: string; quantity: number }[],
): Promise<ReservedItem[]> {
  const reserved: ReservedItem[] = [];
  if (new Set(items.map((i) => i.variantId)).size !== items.length)
    throw new ConflictException('同一规格请合并数量');
  for (const item of [...items].sort((a, b) =>
    a.variantId.localeCompare(b.variantId),
  )) {
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 1000
    )
      throw new ConflictException('商品数量无效');
    const rows = await tx.$queryRaw<
      {
        unlimitedStock: boolean;
        status: string;
        soldOut: boolean;
        deletedAt: Date | null;
      }[]
    >(Prisma.sql`
      SELECT "unlimitedStock", status, "soldOut", "deletedAt" FROM variants
      WHERE id = ${item.variantId}::uuid AND "merchantId" = ${scope.merchantId}::uuid
        AND "brandId" = ${scope.brandId}::uuid AND "storeId" = ${scope.storeId}::uuid FOR UPDATE
    `);
    const variant = rows[0];
    if (
      !variant ||
      variant.status !== 'ACTIVE' ||
      variant.soldOut ||
      variant.deletedAt
    )
      throw new ConflictException('商品已不可售，请刷新购物车');
    if (!variant.unlimitedStock) {
      const changed = await tx.$executeRaw(Prisma.sql`
        UPDATE variants SET "reservedQuantity" = "reservedQuantity" + ${item.quantity}
        WHERE id = ${item.variantId}::uuid AND "merchantId" = ${scope.merchantId}::uuid
          AND "brandId" = ${scope.brandId}::uuid AND "storeId" = ${scope.storeId}::uuid
          AND "stockQuantity" - "reservedQuantity" >= ${item.quantity}
      `);
      if (changed !== 1)
        throw new ConflictException('库存不足，请减少数量后重试');
    }
    reserved.push({
      variantId: item.variantId,
      quantity: item.quantity,
      finiteStock: !variant.unlimitedStock,
    });
  }
  return reserved;
}

/** Caller must lock the order and check its HELD state before applying a terminal transition. */
export async function settleInventory(
  tx: Prisma.TransactionClient,
  scope: TenantScope,
  items: ReservedItem[],
  consume: boolean,
  actor: string,
  orderId: string,
) {
  for (const item of [...items].sort((a, b) =>
    a.variantId.localeCompare(b.variantId),
  )) {
    if (!item.finiteStock) continue;
    const changed = await tx.$executeRaw(Prisma.sql`
      UPDATE variants SET "reservedQuantity" = "reservedQuantity" - ${item.quantity},
        "stockQuantity" = "stockQuantity" - ${consume ? item.quantity : 0}
      WHERE id = ${item.variantId}::uuid AND "merchantId" = ${scope.merchantId}::uuid
        AND "brandId" = ${scope.brandId}::uuid AND "storeId" = ${scope.storeId}::uuid
        AND "reservedQuantity" >= ${item.quantity}
        AND "stockQuantity" >= ${consume ? item.quantity : 0}
    `);
    if (changed !== 1)
      throw new ConflictException('库存预占异常，请联系老板核对');
    if (consume)
      await tx.inventoryMovement.create({
        data: {
          ...scope,
          variantId: item.variantId,
          delta: -item.quantity,
          reason: `测试订单完成：${orderId}`,
          actor,
        },
      });
  }
}
