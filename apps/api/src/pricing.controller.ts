import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  simulatePricing,
  type PricingRule,
  type PricingInput,
} from '@platform/shared';
import { AdminGuard, CostAccess, type AdminRequest } from './auth.js';
import { DatabaseService } from './infrastructure.js';
import { DbErrorFilter } from './db-error.filter.js';
import { id, parse } from './validation.js';
import { pricingRequest, pricingRule } from './pricing.validation.js';
import { readCost } from './cost-reader.js';
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
@Controller('admin/pricing')
@UseGuards(AdminGuard)
@CostAccess()
@UseFilters(DbErrorFilter)
export class PricingController {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}
  @Get('rules') rules(@Req() r: AdminRequest) {
    return this.db.pricingRule.findFirst({
      where: r.scope,
      orderBy: { revision: 'desc' },
    });
  }
  @Put('rules') saveRules(@Req() r: AdminRequest, @Body() body: unknown) {
    if (r.identity.role !== 'OWNER')
      throw new ForbiddenException('仅老板可修改利润保护设置');
    return this.db.pricingRule.create({
      data: {
        ...r.scope,
        actor: r.identity.id,
        rules: json(parse(pricingRule, body)),
      },
    });
  }
  @Get('simulations/:id') history(
    @Req() r: AdminRequest,
    @Param('id') value: string,
  ) {
    return this.db.pricingSimulation.findFirstOrThrow({
      where: { ...r.scope, id: parse(id, value) },
    });
  }
  @Post('simulate') async simulate(
    @Req() r: AdminRequest,
    @Body() body: unknown,
  ) {
    const request = parse(pricingRequest, body);
    if (
      new Set(request.items.map((i) => i.variantId)).size !==
      request.items.length
    )
      throw new BadRequestException('同一规格请合并数量');
    const evidence = await this.db.$transaction(
      async (tx) => {
        const now = new Date();
        const rule = await tx.pricingRule.findFirst({
          where: r.scope,
          orderBy: { revision: 'desc' },
        });
        const store = await tx.store.findFirstOrThrow({
          where: {
            id: r.scope.storeId,
            merchantId: r.scope.merchantId,
            brandId: r.scope.brandId,
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
            where: { ...r.scope, id: item.variantId },
            include: {
              product: {
                include: {
                  modifierGroupRecords: {
                    where: r.scope,
                    include: { modifierRecords: { where: r.scope } },
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
            variant.stockQuantity - variant.reservedQuantity < item.quantity
          )
            blockedReasons.push(`${variant.product.name}库存不足`);
          const cost = await readCost(
            tx,
            r.scope,
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
            const chosen = group.modifierRecords.filter((m) =>
              selected.has(m.id),
            );
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
            BigInt(item.salePriceFen ?? variant.salePriceFen) *
            BigInt(item.quantity);
          variable +=
            BigInt(
              cost.response.ingredientCostFen +
                cost.response.packagingCostFen +
                cost.response.variableCostFen,
            ) * BigInt(item.quantity);
          // ORDER allocation is rounded once for the whole order, not once per item then multiplied back.
          if (cost.input.fixed?.method === 'ITEM')
            fixed +=
              BigInt(cost.response.allocatedFixedCostFen) *
              BigInt(item.quantity);
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
              ...r.scope,
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
        return { input, rule, lines, packaging, request };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 20000,
      },
    );
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
    const record = await this.db.pricingSimulation.create({
      data: {
        ...r.scope,
        actor: r.identity.id,
        calculationVersion: result.calculationVersion,
        inputs: json(evidence),
        result: json(result),
      },
    });
    return {
      ...result,
      simulationId: record.id,
      ruleId: evidence.rule?.id ?? null,
      evidence: {
        lines: evidence.lines,
        packaging: evidence.packaging,
        input: evidence.input,
        rules,
      },
      simulationOnly: true,
    };
  }
}
