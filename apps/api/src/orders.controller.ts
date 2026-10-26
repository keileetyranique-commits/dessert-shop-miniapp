import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AdminGuard, CatalogAccess, type AdminRequest } from './auth.js';
import { DatabaseService } from './infrastructure.js';
import { OrdersService, publicOrder } from './orders.service.js';
import { checkoutInput, TestModeGuard } from './order-security.js';
import {
  checkoutTerms,
  defaultCheckoutTerms,
  jsonValue,
} from './checkout-reader.js';
import { DbErrorFilter } from './db-error.filter.js';

const uuid = z.string().uuid();
const operationKey = z
  .string()
  .min(8)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
function input<T extends z.ZodTypeAny>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException('提交内容不完整或格式不正确，请检查后重试');
  return result.data;
}

@Controller('admin/orders')
@UseGuards(AdminGuard, TestModeGuard)
@CatalogAccess()
@UseFilters(DbErrorFilter)
export class OrdersController {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(OrdersService) private readonly orders: OrdersService,
  ) {}
  @Get('settings') async settings(@Req() r: AdminRequest) {
    const settings = await this.db.orderSettings.findFirst({ where: r.scope });
    return {
      configured: !!settings,
      revision: settings?.revision ?? 0,
      autoAccept: settings?.autoAccept ?? false,
      terms: settings?.terms ?? defaultCheckoutTerms,
    };
  }
  @Put('settings') async saveSettings(
    @Req() r: AdminRequest,
    @Body() body: unknown,
  ) {
    if (r.identity.role !== 'OWNER')
      throw new ForbiddenException('仅老板可确认结算与自动接单设置');
    const data = input(
      z.object({ autoAccept: z.boolean(), terms: checkoutTerms }).strict(),
      body,
    );
    await this.db.$transaction(async (tx) => {
      for (const item of data.terms.orderPackaging) {
        const found = await tx.packagingItem.findFirst({
          where: {
            ...r.scope,
            id: item.packagingItemId,
            scope: 'ORDER',
            status: 'ACTIVE',
            deletedAt: null,
          },
        });
        if (!found)
          throw new BadRequestException('整单包装不存在或不属于当前门店');
      }
      await tx.orderSettings.upsert({
        where: { storeId: r.scope.storeId },
        create: {
          ...r.scope,
          actor: r.identity.id,
          autoAccept: data.autoAccept,
          terms: jsonValue(data.terms),
        },
        update: {
          actor: r.identity.id,
          autoAccept: data.autoAccept,
          terms: jsonValue(data.terms),
          revision: { increment: 1 },
        },
      });
    });
    return this.settings(r);
  }
  @Get('packaging') async packaging(@Req() r: AdminRequest) {
    return this.db.packagingItem.findMany({
      where: { ...r.scope, scope: 'ORDER', status: 'ACTIVE', deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
  @Get('menu') async menu(@Req() r: AdminRequest) {
    return this.db.product.findMany({
      where: { ...r.scope, deletedAt: null, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      take: 200,
      select: {
        id: true,
        name: true,
        description: true,
        imageUrl: true,
        variantRecords: {
          where: {
            ...r.scope,
            deletedAt: null,
            status: 'ACTIVE',
            soldOut: false,
          },
          select: {
            id: true,
            name: true,
            salePriceFen: true,
            unlimitedStock: true,
            stockQuantity: true,
            reservedQuantity: true,
          },
        },
        modifierGroupRecords: {
          where: { ...r.scope, status: 'ACTIVE' },
          select: {
            id: true,
            name: true,
            minSelections: true,
            maxSelections: true,
            modifierRecords: {
              where: { ...r.scope, status: 'ACTIVE' },
              select: { id: true, name: true, salePriceFen: true },
            },
          },
        },
      },
    });
  }
  @Post('preview') preview(@Req() r: AdminRequest, @Body() body: unknown) {
    return this.orders.preview(r, input(checkoutInput, body));
  }
  @Post() create(@Req() r: AdminRequest, @Body() body: unknown) {
    return this.orders.create(
      r,
      input(
        z
          .object({
            previewId: uuid,
            idempotencyKey: operationKey,
            acceptTopup: z.boolean(),
          })
          .strict(),
        body,
      ),
    );
  }
  @Get() async list(@Req() r: AdminRequest, @Query() query: unknown) {
    const q = input(
      z
        .object({
          search: z.string().max(160).optional(),
          status: z
            .enum([
              'PENDING_PAYMENT',
              'AWAITING_ACCEPTANCE',
              'PREPARING',
              'READY',
              'IN_DELIVERY',
              'COMPLETED',
              'CANCELLED',
              'EXCEPTION',
            ])
            .optional(),
          page: z.coerce.number().int().min(1).max(10000).default(1),
        })
        .strict(),
      query,
    );
    const where = {
      ...r.scope,
      ...(q.status === 'EXCEPTION'
        ? { issue: { not: '' } }
        : q.status
          ? { orderStatus: q.status }
          : {}),
      ...(q.search
        ? {
            OR: [
              { actor: { contains: q.search, mode: 'insensitive' as const } },
              ...(uuid.safeParse(q.search).success ? [{ id: q.search }] : []),
            ],
          }
        : {}),
    };
    const [rows, total] = await this.db.$transaction([
      this.db.order.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * 50,
        take: 50,
      }),
      this.db.order.count({ where }),
    ]);
    return { items: rows.map(publicOrder), total, page: q.page };
  }
  @Get(':id') async detail(@Req() r: AdminRequest, @Param('id') value: string) {
    const order = await this.db.order.findFirst({
      where: { ...r.scope, id: input(uuid, value) },
    });
    if (!order) throw new NotFoundException('订单不存在');
    const events = await this.db.orderEvent.findMany({
      where: { ...r.scope, orderId: order.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
      select: {
        id: true,
        action: true,
        actor: true,
        before: true,
        after: true,
        createdAt: true,
      },
    });
    return { ...publicOrder(order), events };
  }
  @Post(':id/actions') action(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    const data = input(
      z
        .object({
          action: z.enum([
            'RECOVER_CANCEL',
            'PAY',
            'PAY_FAIL',
            'ACCEPT',
            'REJECT',
            'READY',
            'DISPATCH',
            'DRIVER_ACCEPT',
            'DRIVER_FAIL',
            'DELIVERED',
            'PICKUP',
            'CANCEL',
            'EXPIRE',
          ]),
          idempotencyKey: operationKey,
        })
        .strict(),
      body,
    );
    return this.orders.action(
      r,
      input(uuid, value),
      data.action,
      data.idempotencyKey,
    );
  }
  @Post(':id/requote') renewQuote(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    const data = input(
      z.object({ idempotencyKey: operationKey }).strict(),
      body,
    );
    return this.orders.requote(
      r,
      input(uuid, value),
      data.idempotencyKey,
      false,
      true,
    );
  }
}

@Controller('admin/order-test')
@UseGuards(AdminGuard, TestModeGuard)
@CatalogAccess()
@UseFilters(DbErrorFilter)
export class OrderTestController {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(OrdersService) private readonly orders: OrdersService,
  ) {}
  @Post('orders/:id/requote') requote(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    const data = input(
      z
        .object({ idempotencyKey: operationKey, increase: z.boolean() })
        .strict(),
      body,
    );
    return this.orders.requote(
      r,
      input(uuid, value),
      data.idempotencyKey,
      data.increase,
    );
  }
  @Post('quotes') async quote(@Req() r: AdminRequest, @Body() body: unknown) {
    const { distanceMeters } = input(
      z
        .object({ distanceMeters: z.number().int().min(0).max(100000) })
        .strict(),
      body,
    );
    const now = new Date();
    const quote = await this.db.mockDeliveryQuote.create({
      data: {
        ...r.scope,
        actor: r.identity.id,
        distanceMeters,
        priceFen: 600 + Math.max(0, Math.ceil(distanceMeters / 1000) - 3) * 100,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 15 * 60000),
      },
    });
    return {
      id: quote.id,
      priceFen: quote.priceFen,
      distanceMeters,
      expiresAt: quote.expiresAt,
      testMode: true,
    };
  }
  @Post('quotes/:id/invalidate') async invalidate(
    @Req() r: AdminRequest,
    @Param('id') value: string,
  ) {
    const changed = await this.db.mockDeliveryQuote.updateMany({
      where: { ...r.scope, id: input(uuid, value), actor: r.identity.id },
      data: { invalidatedAt: new Date() },
    });
    if (!changed.count) throw new NotFoundException('报价不存在');
    return { invalidated: true };
  }
  @Post('orders/:id/timeout') async timeout(
    @Req() r: AdminRequest,
    @Param('id') value: string,
  ) {
    const id = input(uuid, value);
    const changed = await this.db.order.updateMany({
      where: {
        ...r.scope,
        id,
        orderStatus: { in: ['PENDING_PAYMENT', 'AWAITING_ACCEPTANCE'] },
      },
      data: { expiresAt: new Date(0) },
    });
    if (!changed.count)
      throw new BadRequestException('只有待付款或待接单订单可测试超时');
    return this.orders.action(r, id, 'EXPIRE', 'fault-timeout');
  }
}
