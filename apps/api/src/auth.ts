import {
  Injectable,
  Inject,
  ForbiddenException,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { z } from 'zod';
import { CONFIG, type AppConfig } from './config.js';
import { DatabaseService } from './infrastructure.js';
import {
  authenticate,
  authorizeStore,
  requireCostRole,
  type Identity,
} from './identity.js';
export const BrandScope = () => SetMetadata('brandScope', true);
export const CatalogAccess = () => SetMetadata('catalogAccess', true);
export const CostAccess = () => SetMetadata('costAccess', true);
export interface AdminRequest {
  headers: Record<string, string | undefined>;
  identity: Identity;
  scope: { merchantId: string; brandId: string; storeId: string };
}
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(CONFIG) private config: AppConfig,
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(Reflector) private reflector: Reflector,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    ctx.switchToHttp().getResponse().setHeader('Cache-Control', 'no-store');
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    req.identity = authenticate(
      req.headers.authorization,
      this.config.adminIdentities,
    );
    if (
      this.reflector.getAllAndOverride<boolean>('catalogAccess', [
        ctx.getHandler(),
        ctx.getClass(),
      ]) &&
      !['OWNER', 'MANAGER'].includes(req.identity.role)
    )
      throw new ForbiddenException('仅 OWNER/MANAGER 可维护商品与库存');
    if (
      this.reflector.getAllAndOverride<boolean>('costAccess', [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    )
      requireCostRole(req.identity);
    if (
      !this.reflector.getAllAndOverride<boolean>('brandScope', [
        ctx.getHandler(),
        ctx.getClass(),
      ])
    ) {
      const storeId = req.headers['x-store-id'];
      if (!storeId || !z.string().uuid().safeParse(storeId).success)
        throw new ForbiddenException('请选择授权门店');
      authorizeStore(req.identity, storeId);
      const scope = {
        merchantId: req.identity.merchantId,
        brandId: req.identity.brandId,
        storeId,
      };
      if (
        !(await this.db.store.findFirst({
          where: {
            id: storeId,
            merchantId: scope.merchantId,
            brandId: scope.brandId,
            deletedAt: null,
          },
        }))
      )
        throw new ForbiddenException('无此门店权限');
      req.scope = scope;
    }
    return true;
  }
}
