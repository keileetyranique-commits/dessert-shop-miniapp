import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminGuard, CatalogAccess, type AdminRequest } from './auth.js';
import { DatabaseService } from './infrastructure.js';
import { DbErrorFilter } from './db-error.filter.js';
import { id, parse, z } from './validation.js';
import { configureInventory } from './inventory-write.js';

const pagination = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
const search = z.string().trim().max(160).default('');
const listInput = z
  .object({
    ...pagination,
    productSearch: search,
    variantSearch: search,
    categoryId: id.optional(),
    state: z
      .enum([
        'NORMAL',
        'LOW',
        'EMPTY',
        'PAUSED',
        'INACTIVE',
        'SAFETY',
        'ARCHIVED',
      ])
      .optional(),
    mode: z.enum(['finite', 'unlimited']).optional(),
    soldOut: z.enum(['true', 'false']).optional(),
    sort: z.enum(['name', 'available', 'updated']).default('name'),
    direction: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();
const movementInput = z
  .object({
    ...pagination,
    productSearch: search,
    variantSearch: search,
    productId: id.optional(),
    variantId: id.optional(),
    type: z.enum(['ADJUSTMENT', 'ORDER_COMPLETED', 'SETTINGS']).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((v) => !v.from || !v.to || new Date(v.from) <= new Date(v.to));
interface Row {
  id: string;
  productId: string;
  productName: string;
  name: string;
  categoryId: string;
  salePriceFen: number;
  stockQuantity: number;
  reservedQuantity: number;
  unlimitedStock: boolean;
  soldOut: boolean;
  soldOutReason: string;
  lowStockThreshold: number | null;
  available: number | null;
  state: string;
  lowStock: boolean;
  inventoryUpdatedAt: Date | null;
}
interface Summary {
  products: number;
  finite: number;
  unlimited: number;
  normal: number;
  empty: number;
  low: number;
  reserved: number;
  archivedReserved: number;
}
@Controller('admin/inventory')
@UseGuards(AdminGuard)
@UseFilters(DbErrorFilter)
export class InventoryController {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}
  @Get() async list(@Req() r: AdminRequest, @Query() query: unknown) {
    const q = parse(listInput, query) as z.output<typeof listInput>;
    // SQL expressions are fixed; all user values are bound parameters. One snapshot for totals and rows.
    const base = Prisma.sql`WITH inventory AS (
      SELECT v.*, p.name AS "productName", p."categoryId",
        CASE WHEN v."unlimitedStock" THEN NULL ELSE v."stockQuantity" - v."reservedQuantity" END AS available,
        (NOT v."unlimitedStock" AND v."lowStockThreshold" IS NOT NULL AND v."stockQuantity" - v."reservedQuantity" <= v."lowStockThreshold") AS "lowStock",
        CASE WHEN v."deletedAt" IS NOT NULL OR p."deletedAt" IS NOT NULL THEN 'ARCHIVED'
          WHEN p."safetyHoldReason" <> '' THEN 'SAFETY'
          WHEN p.status <> 'ACTIVE' OR v.status <> 'ACTIVE' THEN 'INACTIVE'
          WHEN v."soldOut" THEN 'PAUSED'
          WHEN NOT v."unlimitedStock" AND v."stockQuantity" - v."reservedQuantity" <= 0 THEN 'EMPTY'
          WHEN NOT v."unlimitedStock" AND v."lowStockThreshold" IS NOT NULL AND v."stockQuantity" - v."reservedQuantity" <= v."lowStockThreshold" THEN 'LOW'
          ELSE 'NORMAL' END AS state
      FROM variants v JOIN products p ON p.id = v."productId" AND p."storeId" = v."storeId"
      WHERE v."merchantId" = ${r.scope.merchantId}::uuid AND v."brandId" = ${r.scope.brandId}::uuid AND v."storeId" = ${r.scope.storeId}::uuid
        AND p."merchantId" = ${r.scope.merchantId}::uuid AND p."brandId" = ${r.scope.brandId}::uuid
    )`;
    const filters = Prisma.sql`WHERE ${q.state ? (q.state === 'LOW' ? Prisma.sql`"lowStock" AND state <> 'ARCHIVED'` : Prisma.sql`state = ${q.state}`) : Prisma.sql`state <> 'ARCHIVED'`}
      AND position(lower(${q.productSearch}) in lower("productName")) > 0
      AND position(lower(${q.variantSearch}) in lower(name)) > 0
      ${q.categoryId ? Prisma.sql`AND "categoryId" = ${q.categoryId}::uuid` : Prisma.empty}
      ${q.soldOut ? Prisma.sql`AND "soldOut" = ${q.soldOut === 'true'}` : Prisma.empty}
      ${q.mode ? Prisma.sql`AND "unlimitedStock" = ${q.mode === 'unlimited'}` : Prisma.empty}`;
    const direction =
      q.direction === 'desc' ? Prisma.sql`DESC` : Prisma.sql`ASC`;
    const order =
      q.sort === 'available'
        ? Prisma.sql`available ${direction}`
        : q.sort === 'updated'
          ? Prisma.sql`"inventoryUpdatedAt" ${direction}`
          : Prisma.sql`"productName" ${direction}, name ${direction}`;
    return this.db.$transaction(
      async (tx) => {
        const [summary] = await tx.$queryRaw<
          Summary[]
        >(Prisma.sql`${base} SELECT
        (SELECT count(*)::float8 FROM products WHERE "merchantId" = ${r.scope.merchantId}::uuid AND "brandId" = ${r.scope.brandId}::uuid AND "storeId" = ${r.scope.storeId}::uuid AND "deletedAt" IS NULL) AS products,
        count(*) FILTER (WHERE NOT "unlimitedStock" AND state <> 'ARCHIVED')::float8 AS finite,
        count(*) FILTER (WHERE "unlimitedStock" AND state <> 'ARCHIVED')::float8 AS unlimited,
        count(*) FILTER (WHERE state = 'NORMAL')::float8 AS normal,
        count(*) FILTER (WHERE state IN ('EMPTY','PAUSED'))::float8 AS empty,
        count(*) FILTER (WHERE "lowStock" AND state <> 'ARCHIVED')::float8 AS low,
        COALESCE(sum("reservedQuantity"),0)::float8 AS reserved,
        COALESCE(sum("reservedQuantity") FILTER (WHERE state = 'ARCHIVED'),0)::float8 AS "archivedReserved" FROM inventory`);
        const [total] = await tx.$queryRaw<{ count: number }[]>(
          Prisma.sql`${base} SELECT count(*)::float8 AS count FROM inventory ${filters}`,
        );
        const items = await tx.$queryRaw<Row[]>(
          Prisma.sql`${base} SELECT id, "productId", "productName", name, "categoryId", "salePriceFen", "stockQuantity", "reservedQuantity", "unlimitedStock", "soldOut", "soldOutReason", "lowStockThreshold", available, state, "lowStock", "inventoryUpdatedAt" FROM inventory ${filters} ORDER BY ${order} NULLS LAST, id ASC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
        );
        return {
          items,
          total: total?.count ?? 0,
          summary,
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  @Get('movements') async movements(
    @Req() r: AdminRequest,
    @Query() query: unknown,
  ) {
    const q = parse(movementInput, query) as z.output<typeof movementInput>;
    const where: Prisma.InventoryMovementWhereInput = {
      ...r.scope,
      variantId: q.variantId,
      type: q.type,
      variant: {
        ...r.scope,
        productId: q.productId,
        name: { contains: q.variantSearch, mode: 'insensitive' },
        product: {
          ...r.scope,
          name: { contains: q.productSearch, mode: 'insensitive' },
        },
      },
      createdAt: {
        gte: q.from ? new Date(q.from) : undefined,
        lte: q.to ? new Date(q.to) : undefined,
      },
    };
    return this.db.$transaction(
      async (tx) => ({
        total: await tx.inventoryMovement.count({ where }),
        items: await tx.inventoryMovement.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
          select: {
            id: true,
            createdAt: true,
            delta: true,
            type: true,
            reason: true,
            actor: true,
            orderId: true,
            before: true,
            after: true,
            variant: {
              select: {
                id: true,
                name: true,
                product: { select: { id: true, name: true } },
              },
            },
          },
        }),
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  @Patch('variants/:id') @CatalogAccess() settings(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    return configureInventory(this.db, r, value, body);
  }
}
