import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Req,
  Query,
  Inject,
  UseGuards,
  UseFilters,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { calculateCost, quantity, type CostInput } from '@platform/shared';
import { DatabaseService } from './infrastructure.js';
import { AdminGuard, CostAccess, type AdminRequest } from './auth.js';
import { DbErrorFilter } from './db-error.filter.js';
import {
  parse,
  id,
  z,
  month,
  fulfillment,
  positive,
  money,
  ingredientInput,
  purchaseInput,
  recipeInput,
  packagingInput,
  packagingMapping,
  fixedInput,
  allocationInput,
} from './validation.js';
function checkUnit(q: string, u: string, base: string) {
  try {
    quantity(q, u, base);
  } catch {
    throw new BadRequestException('数量或计量单位不兼容');
  }
}
@Controller('admin/costs')
@UseGuards(AdminGuard)
@CostAccess()
@UseFilters(DbErrorFilter)
export class CostController {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}
  @Get('modifiers') modifiers(@Req() r: AdminRequest) {
    return this.db.modifier.findMany({
      where: { ...r.scope, group: { product: { deletedAt: null } } },
      orderBy: { createdAt: 'asc' },
    });
  }
  @Patch('modifiers/:id') modifierCost(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    return this.db.modifier.update({
      where: {
        id: parse(id, value),
        ...r.scope,
        group: { product: { deletedAt: null } },
      },
      data: parse(z.object({ costFen: money }).strict(), body),
    });
  }
  @Get('ingredients') ingredients(@Req() r: AdminRequest) {
    return this.db.ingredient.findMany({
      where: { ...r.scope, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }
  @Post('ingredients') ingredient(
    @Req() r: AdminRequest,
    @Body() body: unknown,
  ) {
    return this.db.ingredient.create({
      data: { ...r.scope, ...parse(ingredientInput, body) },
    });
  }
  @Patch('ingredients/:id') editIngredient(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    // Base unit is immutable: changing it would reinterpret historical quantities.
    return this.db.ingredient.update({
      where: {
        storeId_id: { storeId: r.scope.storeId, id: parse(id, value) },
        ...r.scope,
        deletedAt: null,
      },
      data: parse(
        ingredientInput.omit({ baseUnit: true }).partial().strict(),
        body,
      ),
    });
  }
  @Get('purchases') purchases(@Req() r: AdminRequest) {
    return this.db.purchaseRecord.findMany({
      where: r.scope,
      orderBy: [{ purchasedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }
  @Post('purchases') async purchase(
    @Req() r: AdminRequest,
    @Body() body: unknown,
  ) {
    const data = parse(purchaseInput, body);
    const ingredient = await this.db.ingredient.findFirstOrThrow({
      where: { ...r.scope, id: data.ingredientId, deletedAt: null },
    });
    checkUnit(data.quantity, data.unit, ingredient.baseUnit);
    if (new Date(data.purchasedAt).getTime() > Date.now())
      throw new BadRequestException('采购时间不能在未来');
    return this.db.purchaseRecord.create({ data: { ...r.scope, ...data } });
  }
  @Get('variants/:id/recipes') recipes(
    @Req() r: AdminRequest,
    @Param('id') value: string,
  ) {
    return this.db.recipe.findMany({
      where: { ...r.scope, variantId: parse(id, value) },
      include: { recipeItemRecords: { where: r.scope } },
      orderBy: { version: 'desc' },
    });
  }
  @Put('variants/:id/recipe') async recipe(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    const variantId = parse(id, value),
      data = parse(recipeInput, body),
      s = r.scope;
    if (
      new Set(data.items.map((i) => i.ingredientId)).size !== data.items.length
    )
      throw new BadRequestException('配方食材不能重复');
    return this.db.$transaction(
      async (tx) => {
        await tx.variant.findFirstOrThrow({
          where: {
            ...s,
            id: variantId,
            deletedAt: null,
            product: { deletedAt: null },
          },
        });
        for (const item of data.items) {
          const ingredient = await tx.ingredient.findFirstOrThrow({
            where: { ...s, id: item.ingredientId, deletedAt: null },
          });
          checkUnit(item.quantity, item.unit, ingredient.baseUnit);
        }
        const previous = await tx.recipe.findFirst({
          where: { ...s, variantId },
          orderBy: { version: 'desc' },
        });
        await tx.recipe.updateMany({
          where: { ...s, variantId, active: true },
          data: { active: false },
        });
        const recipe = await tx.recipe.create({
          data: {
            ...s,
            variantId,
            version: (previous?.version ?? 0) + 1,
            yieldQuantity: data.yieldQuantity,
            laborSeconds: data.laborSeconds,
            otherVariableCostFen: data.otherVariableCostFen,
          },
        });
        await tx.recipeItem.createMany({
          data: data.items.map((item) => ({
            ...s,
            ...item,
            recipeId: recipe.id,
          })),
        });
        return recipe;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  @Post('variants/:id/recipes/:recipeId/activate') async activate(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Param('recipeId') recipeId: string,
  ) {
    const variantId = parse(id, value),
      target = parse(id, recipeId);
    return this.db.$transaction(
      async (tx) => {
        await tx.recipe.findFirstOrThrow({
          where: {
            ...r.scope,
            id: target,
            variantId,
            variant: { deletedAt: null, product: { deletedAt: null } },
          },
        });
        await tx.recipe.updateMany({
          where: { ...r.scope, variantId, active: true },
          data: { active: false },
        });
        return tx.recipe.update({
          where: {
            storeId_id: { storeId: r.scope.storeId, id: target },
            ...r.scope,
          },
          data: { active: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  @Get('packaging') packaging(@Req() r: AdminRequest) {
    return this.db.packagingItem.findMany({
      where: { ...r.scope, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }
  @Post('packaging') createPackaging(
    @Req() r: AdminRequest,
    @Body() body: unknown,
  ) {
    return this.db.packagingItem.create({
      data: { ...r.scope, ...parse(packagingInput, body) },
    });
  }
  @Patch('packaging/:id') editPackaging(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    return this.db.packagingItem.update({
      where: {
        storeId_id: { storeId: r.scope.storeId, id: parse(id, value) },
        ...r.scope,
        deletedAt: null,
      },
      data: parse(
        packagingInput.omit({ scope: true }).partial().strict(),
        body,
      ),
    });
  }
  @Get('variants/:id/packaging') mappings(
    @Req() r: AdminRequest,
    @Param('id') value: string,
  ) {
    return this.db.packagingConfiguration.findMany({
      where: { ...r.scope, variantId: parse(id, value) },
      include: { skuPackagingRecords: { where: r.scope } },
    });
  }
  @Put('variants/:id/packaging') async mapPackaging(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    const variantId = parse(id, value),
      data = parse(packagingMapping, body),
      s = r.scope;
    if (
      new Set(data.items.map((i) => i.packagingItemId)).size !==
      data.items.length
    )
      throw new BadRequestException('包装项目不能重复');
    return this.db.$transaction(
      async (tx) => {
        await tx.variant.findFirstOrThrow({
          where: {
            ...s,
            id: variantId,
            deletedAt: null,
            product: { deletedAt: null },
          },
        });
        for (const item of data.items)
          await tx.packagingItem.findFirstOrThrow({
            where: {
              ...s,
              id: item.packagingItemId,
              scope: 'SKU',
              deletedAt: null,
            },
          });
        const config = await tx.packagingConfiguration.upsert({
          where: {
            storeId_variantId_fulfillment: {
              storeId: s.storeId,
              variantId,
              fulfillment: data.fulfillment,
            },
          },
          create: { ...s, variantId, fulfillment: data.fulfillment },
          update: {},
        });
        await tx.skuPackaging.deleteMany({
          where: { ...s, configurationId: config.id },
        });
        await tx.skuPackaging.createMany({
          data: data.items.map((i) => ({
            ...s,
            ...i,
            configurationId: config.id,
          })),
        });
        return config;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  @Get('fixed/:month') async fixed(
    @Req() r: AdminRequest,
    @Param('month') value: string,
  ) {
    return this.db.monthlyFixedCost.findFirst({
      where: { ...r.scope, month: parse(month, value) },
    });
  }
  @Put('fixed/:month') saveFixed(
    @Req() r: AdminRequest,
    @Param('month') value: string,
    @Body() body: unknown,
  ) {
    const m = parse(month, value),
      data = parse(fixedInput, body);
    return this.db.monthlyFixedCost.upsert({
      where: { storeId_month: { storeId: r.scope.storeId, month: m } },
      create: { ...r.scope, month: m, ...data },
      update: data,
    });
  }
  @Get('allocation/:month') allocation(
    @Req() r: AdminRequest,
    @Param('month') value: string,
  ) {
    return this.db.costAllocationRule.findFirst({
      where: { ...r.scope, month: parse(month, value) },
    });
  }
  @Put('allocation/:month') saveAllocation(
    @Req() r: AdminRequest,
    @Param('month') value: string,
    @Body() body: unknown,
  ) {
    const m = parse(month, value),
      data = parse(allocationInput, body);
    return this.db.costAllocationRule.upsert({
      where: { storeId_month: { storeId: r.scope.storeId, month: m } },
      create: { ...r.scope, month: m, ...data },
      update: data,
    });
  }
  @Get('variants/:id/cost') cost(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Query() query: unknown,
  ) {
    return this.calculate(r, value, query, false);
  }
  @Post('variants/:id/cost/snapshots') saveSnapshot(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    return this.calculate(r, value, body, true);
  }
  private async calculate(
    r: AdminRequest,
    value: string,
    query: unknown,
    save: boolean,
  ) {
    const variantId = parse(id, value),
      options = parse(
        z
          .object({
            month,
            fulfillment,
            itemsPerOrder: z
              .string()
              .regex(/^[1-9]\d{0,8}$/)
              .optional(),
          })
          .strict(),
        query,
      );
    const itemsPerOrder = options.itemsPerOrder
      ? parse(positive, Number(options.itemsPerOrder))
      : undefined;
    return this.db.$transaction(
      async (tx) => {
        const s = r.scope,
          calculatedAt = new Date();
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
          throw new BadRequestException(
            '成本计算输入无效或金额超出安全整数范围',
          );
        }
        const response = {
          ...result,
          calculatedAt: calculatedAt.toISOString(),
          month: options.month,
          fulfillment: options.fulfillment,
          recipeVersion: recipe?.version ?? null,
        };
        if (!save) return response;
        const snapshot = await tx.costSnapshot.create({
          data: {
            ...s,
            variantId,
            calculationVersion: result.calculationVersion,
            inputs: JSON.parse(
              JSON.stringify({
                input,
                recipeId: recipe?.id,
                purchaseIds: recipe?.recipeItemRecords.map(
                  (i) => purchases.get(i.ingredientId)?.id,
                ),
                fixedCostId: fixed?.id,
                allocationRuleId: rule?.id,
              }),
            ),
            result: JSON.parse(JSON.stringify(response)),
          },
        });
        return { ...response, snapshotId: snapshot.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  @Get('snapshots/:id') snapshot(
    @Req() r: AdminRequest,
    @Param('id') value: string,
  ) {
    return this.db.costSnapshot.findFirstOrThrow({
      where: { ...r.scope, id: parse(id, value) },
    });
  }
}
