import {
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
import { AdminGuard, CostAccess, type AdminRequest } from './auth.js';
import { DatabaseService } from './infrastructure.js';
import { DbErrorFilter } from './db-error.filter.js';
import { id, parse } from './validation.js';
import { pricingRequest, pricingRule } from './pricing.validation.js';
import { readPricing } from './pricing-reader.js';
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
    const { evidence, rules, result } = await this.db.$transaction(
      (tx) => readPricing(tx, r.scope, request),
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 20000,
      },
    );
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
