import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Prisma, type Order } from '@prisma/client';
import {
  transitionOrder,
  type OrderAction,
  type OrderState,
} from '@platform/shared';
import { z } from 'zod';
import { DatabaseService } from './infrastructure.js';
import { CONFIG, type AppConfig } from './config.js';
import type { AdminRequest } from './auth.js';
import { checkoutInput, requestFingerprint } from './order-security.js';
import { readCheckout, jsonValue } from './checkout-reader.js';
import { reserveInventory, settleInventory } from './order-inventory.js';

const savedRequest = z
  .object({ checkout: checkoutInput, acceptTopup: z.boolean() })
  .strict();
export function publicOrder(order: Order) {
  return {
    id: order.id,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    mode: order.mode,
    snapshot: order.snapshot,
    payableFen: order.payableFen,
    issue: order.issue,
    version: order.version,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    expiresAt: order.expiresAt,
    testMode: true,
  };
}
const stateOf = (order: Order): OrderState => ({
  order: order.orderStatus as OrderState['order'],
  payment: order.paymentStatus as OrderState['payment'],
  fulfillment: order.fulfillmentStatus as OrderState['fulfillment'],
  reservation: order.reservationStatus as OrderState['reservation'],
  mode: order.mode as OrderState['mode'],
});

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private sweepRunning?: Promise<void>;
  private readonly logger = new Logger(OrdersService.name);
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}
  onModuleInit() {
    if (!this.config.testMode || this.config.environment === 'production')
      return;
    this.timer = setInterval(() => {
      if (this.sweepRunning) return;
      this.sweepRunning = this.sweepExpired()
        .catch(() => {
          this.logger.warn('测试订单超时检查暂未完成，下轮自动重试');
        })
        .finally(() => {
          this.sweepRunning = undefined;
        });
    }, 10000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.sweepRunning;
  }
  async sweepExpired() {
    this.assertEnabled();
    const expired = await this.db.order.findMany({
      where: {
        orderStatus: { in: ['PENDING_PAYMENT', 'AWAITING_ACCEPTANCE'] },
        expiresAt: { lte: new Date() },
      },
      orderBy: { expiresAt: 'asc' },
      take: 100,
    });
    for (const order of expired) {
      const scope = {
        merchantId: order.merchantId,
        brandId: order.brandId,
        storeId: order.storeId,
      };
      try {
        await this.action(
          {
            scope,
            headers: {},
            identity: {
              ...scope,
              id: 'system:order-timeout',
              role: 'OWNER',
              storeIds: [scope.storeId],
              token: '',
            },
          },
          order.id,
          'EXPIRE',
          'system-timeout',
        );
      } catch (error) {
        if (!(error instanceof ConflictException)) throw error;
      }
    }
    // Quotes and previews are short-lived working data; completed order evidence is retained separately.
    const before = new Date(Date.now() - 86400000);
    const previews = await this.db.checkoutPreview.findMany({
      where: { expiresAt: { lt: before } },
      select: { id: true },
      take: 100,
    });
    if (previews.length)
      await this.db.checkoutPreview.deleteMany({
        where: { id: { in: previews.map((p) => p.id) } },
      });
    const quotes = await this.db.mockDeliveryQuote.findMany({
      where: { expiresAt: { lt: before } },
      select: { id: true },
      take: 100,
    });
    if (quotes.length)
      await this.db.mockDeliveryQuote.deleteMany({
        where: { id: { in: quotes.map((q) => q.id) } },
      });
  }
  private assertEnabled() {
    if (!this.config.testMode || this.config.environment === 'production')
      throw new ForbiddenException('当前环境未开放模拟测试功能');
  }
  private async transaction<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    this.assertEnabled();
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(work, {
          isolationLevel: 'Serializable',
          timeout: 20000,
        });
      } catch (error) {
        if (
          attempt < 3 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (['P2034', 'P2002'].includes(error.code) ||
            (error.code === 'P2010' &&
              ['40001', '40P01'].includes(String(error.meta?.code))))
        )
          continue;
        throw error;
      }
    }
  }
  async preview(r: AdminRequest, body: unknown) {
    const request = checkoutInput.parse(body);
    return this.transaction(async (tx) => {
      const value = await readCheckout(tx, r.scope, r.identity.id, request);
      const preview = await tx.checkoutPreview.create({
        data: {
          ...r.scope,
          actor: r.identity.id,
          request: jsonValue(request),
          publicResult: jsonValue(value.publicResult),
          evidence: jsonValue(value.evidence),
          fingerprint: value.fingerprint,
          expiresAt: new Date(Date.now() + 120000),
        },
      });
      return {
        ...value.publicResult,
        previewId: preview.id,
        expiresAt: preview.expiresAt,
      };
    });
  }
  async create(
    r: AdminRequest,
    input: { previewId: string; idempotencyKey: string; acceptTopup: boolean },
  ) {
    return this.transaction(async (tx) => {
      const hash = requestFingerprint(input);
      const existing = await tx.order.findFirst({
        where: {
          ...r.scope,
          actor: r.identity.id,
          idempotencyKey: input.idempotencyKey,
        },
      });
      if (existing) {
        if (existing.requestHash !== hash)
          throw new ConflictException('此操作编号已用于其他订单，请刷新重试');
        return publicOrder(existing);
      }
      const preview = await tx.checkoutPreview.findFirst({
        where: {
          ...r.scope,
          id: input.previewId,
          actor: r.identity.id,
          expiresAt: { gt: new Date() },
        },
      });
      if (!preview) throw new ConflictException('结算预览已过期，请重新确认');
      const checkout = checkoutInput.parse(preview.request);
      const value = await readCheckout(
        tx,
        r.scope,
        r.identity.id,
        checkout,
        input.acceptTopup,
      );
      if (value.fingerprint !== preview.fingerprint)
        throw new ConflictException('价格、费用或门店设置已变化，请重新结算');
      if (value.publicResult.decision !== 'PASS')
        throw new ConflictException(value.publicResult.message);
      const reserved = await reserveInventory(tx, r.scope, checkout.items);
      const order = await tx.order.create({
        data: {
          ...r.scope,
          actor: r.identity.id,
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          request: jsonValue({ checkout, acceptTopup: input.acceptTopup }),
          snapshot: jsonValue(value.publicResult),
          evidence: jsonValue(value.evidence),
          fingerprint: value.fingerprint,
          mode: checkout.fulfillment,
          payableFen: value.publicResult.payableFen,
          expiresAt: new Date(Date.now() + 15 * 60000),
        },
      });
      for (const item of reserved)
        await tx.orderItem.create({
          data: {
            ...r.scope,
            orderId: order.id,
            ...item,
            snapshot: jsonValue(
              value.publicResult.lines.find(
                (l) => l.variantId === item.variantId,
              ),
            ),
          },
        });
      await tx.orderEvent.create({
        data: {
          ...r.scope,
          orderId: order.id,
          actor: r.identity.id,
          idempotencyKey: 'create',
          requestHash: hash,
          action: 'CREATE',
          before: {},
          after: jsonValue(stateOf(order)),
        },
      });
      return publicOrder(order);
    });
  }
  async action(
    r: AdminRequest,
    orderId: string,
    action: OrderAction,
    idempotencyKey: string,
  ) {
    return this.transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM orders WHERE id = ${orderId}::uuid AND "merchantId" = ${r.scope.merchantId}::uuid AND "brandId" = ${r.scope.brandId}::uuid AND "storeId" = ${r.scope.storeId}::uuid FOR UPDATE`,
      );
      if (!locked.length) throw new NotFoundException('订单不存在');
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: true },
      });
      const hash = requestFingerprint({ action });
      const prior = await tx.orderEvent.findUnique({
        where: { orderId_idempotencyKey: { orderId, idempotencyKey } },
      });
      if (prior) {
        if (prior.requestHash !== hash)
          throw new ConflictException('此操作编号已被使用，请刷新后重试');
        return publicOrder(order);
      }
      const before = stateOf(order);
      let after: OrderState;
      try {
        after = transitionOrder(before, action);
      } catch {
        throw new ConflictException('当前订单状态不允许此操作，请刷新后重试');
      }
      if (requestFingerprint(before) === requestFingerprint(after))
        return publicOrder(order);
      if (['PAY', 'ACCEPT', 'DISPATCH'].includes(action)) {
        if (
          order.expiresAt <= new Date() &&
          ['PENDING_PAYMENT', 'AWAITING_ACCEPTANCE'].includes(order.orderStatus)
        )
          throw new ConflictException('订单已超时，请取消后重新下单');
        const request = savedRequest.parse(order.request);
        const own = Object.fromEntries(
          order.items
            .filter((i) => i.finiteStock)
            .map((i) => [i.variantId, i.quantity]),
        );
        const current = await readCheckout(
          tx,
          r.scope,
          order.actor,
          request.checkout,
          request.acceptTopup,
          own,
        );
        if (
          current.fingerprint !== order.fingerprint ||
          current.publicResult.payableFen !== order.payableFen ||
          current.publicResult.decision !== 'PASS'
        )
          throw new ConflictException(
            '商品、报价或利润保护条件已变化，不能继续此操作',
          );
        if (action === 'PAY' && current.settings?.autoAccept)
          after = transitionOrder(after, 'ACCEPT');
      }
      if (action === 'EXPIRE' && order.expiresAt > new Date())
        throw new ConflictException('订单尚未超时');
      if (before.reservation === 'HELD' && after.reservation !== 'HELD')
        await settleInventory(
          tx,
          r.scope,
          order.items,
          after.reservation === 'CONSUMED',
          r.identity.id,
          order.id,
        );
      const updated = await tx.order.update({
        where: { id: order.id },
        data: {
          orderStatus: after.order,
          paymentStatus: after.payment,
          fulfillmentStatus: after.fulfillment,
          reservationStatus: after.reservation,
          version: { increment: 1 },
          issue:
            after.fulfillment === 'FAILED' ? '模拟配送未接单，可重试发单' : '',
          ...(action === 'PAY'
            ? { expiresAt: new Date(Date.now() + 15 * 60000) }
            : {}),
        },
      });
      await tx.orderEvent.create({
        data: {
          ...r.scope,
          orderId,
          actor: r.identity.id,
          idempotencyKey,
          requestHash: hash,
          action,
          before: jsonValue(before),
          after: jsonValue(after),
        },
      });
      return publicOrder(updated);
    });
  }
}
