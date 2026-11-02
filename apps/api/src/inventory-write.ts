import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { DatabaseService } from './infrastructure.js';
import type { AdminRequest } from './auth.js';
import { z, count, id, parse } from './validation.js';

const reason = z.string().trim().min(1).max(500);
export const stockInput = z
  .object({
    delta: z
      .number()
      .int()
      .min(-2147483647)
      .max(2147483647)
      .refine((v) => v !== 0),
    reason,
    idempotencyKey: id.optional(),
  })
  .strict();
export const inventorySettings = z
  .object({
    lowStockThreshold: count.nullable().optional(),
    soldOut: z.boolean().optional(),
    reason,
    idempotencyKey: id,
  })
  .strict()
  .refine((v) => v.soldOut !== undefined || v.lowStockThreshold !== undefined);
function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function inventorySnapshot(v: {
  stockQuantity: number;
  reservedQuantity: number;
  soldOut: boolean;
  lowStockThreshold: number | null;
  soldOutReason: string;
}) {
  return {
    stockQuantity: v.stockQuantity,
    reservedQuantity: v.reservedQuantity,
    soldOut: v.soldOut,
    lowStockThreshold: v.lowStockThreshold,
    soldOutReason: v.soldOutReason,
  };
}
async function previous(
  tx: Prisma.TransactionClient,
  r: AdminRequest,
  variantId: string,
  key: string | undefined,
  hash: string,
) {
  if (!key) return false;
  const old = await tx.inventoryMovement.findFirst({
    where: { ...r.scope, variantId, actor: r.identity.id, idempotencyKey: key },
  });
  if (!old) return false;
  if (old.requestHash !== hash)
    throw new ConflictException('此操作已提交，请勿更改内容后重复发送');
  return true;
}
async function lock(
  tx: Prisma.TransactionClient,
  r: AdminRequest,
  variantId: string,
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM variants WHERE id = ${variantId}::uuid AND "merchantId" = ${r.scope.merchantId}::uuid AND "brandId" = ${r.scope.brandId}::uuid AND "storeId" = ${r.scope.storeId}::uuid FOR UPDATE`,
  );
}
/** Keep the original stock transaction/row lock; all callers share the same finite-stock boundary. */
export async function adjustStock(
  db: DatabaseService,
  r: AdminRequest,
  value: string,
  body: unknown,
) {
  const variantId = parse(id, value),
    data = parse(stockInput, body);
  const hash = fingerprint({ type: 'ADJUSTMENT', ...data });
  return db.$transaction(async (tx) => {
    await lock(tx, r, variantId);
    if (await previous(tx, r, variantId, data.idempotencyKey, hash))
      return tx.variant.findFirstOrThrow({
        where: { ...r.scope, id: variantId },
      });
    const current = await tx.variant.findFirst({
      where: {
        ...r.scope,
        id: variantId,
        deletedAt: null,
        product: { deletedAt: null },
      },
    });
    if (!current) throw new ConflictException('库存不足、超出范围或规格不存在');
    if (current.unlimitedStock)
      throw new ConflictException('不限库存的规格无需调整数量');
    if (current.stockQuantity + data.delta < current.reservedQuantity)
      throw new ConflictException(
        '库存已被待完成订单预占，不能减少到预占数量以下',
      );
    const result = await tx.variant.updateMany({
      where: {
        ...r.scope,
        id: variantId,
        deletedAt: null,
        product: { deletedAt: null },
        stockQuantity:
          data.delta < 0
            ? { gte: -data.delta }
            : { lte: 2147483647 - data.delta },
      },
      data: { stockQuantity: { increment: data.delta } },
    });
    if (result.count !== 1)
      throw new ConflictException('库存不足、超出范围或规格不存在');
    const after = await tx.variant.findFirstOrThrow({
      where: { ...r.scope, id: variantId },
    });
    await tx.inventoryMovement.create({
      data: {
        ...r.scope,
        variantId,
        ...data,
        actor: r.identity.id,
        requestHash: hash,
        before: inventorySnapshot(current),
        after: inventorySnapshot(after),
      },
    });
    return after;
  });
}
export async function configureInventory(
  db: DatabaseService,
  r: AdminRequest,
  value: string,
  body: unknown,
) {
  const variantId = parse(id, value),
    data = parse(inventorySettings, body);
  if (data.lowStockThreshold !== undefined && r.identity.role !== 'OWNER')
    throw new ForbiddenException('仅老板可设置库存预警');
  const hash = fingerprint({ type: 'SETTINGS', ...data });
  return db.$transaction(async (tx) => {
    await lock(tx, r, variantId);
    if (await previous(tx, r, variantId, data.idempotencyKey, hash))
      return { saved: true };
    const current = await tx.variant.findFirst({
      where: {
        ...r.scope,
        id: variantId,
        deletedAt: null,
        product: { deletedAt: null },
      },
      include: { product: true },
    });
    if (!current) throw new NotFoundException('规格不存在或已归档');
    if (
      data.lowStockThreshold !== undefined &&
      data.lowStockThreshold !== null &&
      current.unlimitedStock
    )
      throw new ConflictException('不限库存的规格无需设置数量预警');
    if (
      data.soldOut === false &&
      (current.product.safetyHoldReason ||
        current.product.status !== 'ACTIVE' ||
        current.status !== 'ACTIVE')
    )
      throw new ConflictException(
        '商品已下架或因安全原因停售，请先核对商品资料',
      );
    const after = await tx.variant.update({
      where: { ...r.scope, id: variantId },
      data: {
        lowStockThreshold: data.lowStockThreshold,
        soldOut: data.soldOut,
        ...(data.soldOut === undefined
          ? {}
          : { soldOutReason: data.soldOut ? data.reason : '' }),
      },
    });
    await tx.inventoryMovement.create({
      data: {
        ...r.scope,
        variantId,
        delta: 0,
        type: 'SETTINGS',
        reason: data.reason,
        actor: r.identity.id,
        idempotencyKey: data.idempotencyKey,
        requestHash: hash,
        before: inventorySnapshot(current),
        after: inventorySnapshot(after),
      },
    });
    return { saved: true };
  });
}
