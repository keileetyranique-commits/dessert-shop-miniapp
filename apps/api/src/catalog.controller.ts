import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UseFilters,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { DatabaseService } from './infrastructure.js';
import {
  AdminGuard,
  BrandScope,
  CatalogAccess,
  type AdminRequest,
} from './auth.js';
import { DbErrorFilter } from './db-error.filter.js';
import {
  parse,
  id,
  z,
  storeInput,
  categoryInput,
  productInput,
  variantInput,
  variantEdit,
  money,
  groupInput,
  modifierInput,
} from './validation.js';
@Controller('admin')
@UseGuards(AdminGuard)
@UseFilters(DbErrorFilter)
export class CatalogController {
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}
  @Get('session') @BrandScope() session(@Req() r: AdminRequest) {
    const { token: _token, ...identity } = r.identity;
    void _token;
    return identity;
  }
  @Get('stores') @BrandScope() stores(@Req() r: AdminRequest) {
    const i = r.identity;
    return this.db.store.findMany({
      where: {
        merchantId: i.merchantId,
        brandId: i.brandId,
        deletedAt: null,
        ...(i.storeIds === '*' ? {} : { id: { in: i.storeIds } }),
      },
      orderBy: { createdAt: 'asc' },
    });
  }
  @Post('stores') @CatalogAccess() @BrandScope() createStore(
    @Req() r: AdminRequest,
    @Body() body: unknown,
  ) {
    if (r.identity.role !== 'OWNER' || r.identity.storeIds !== '*')
      throw new ForbiddenException('仅品牌级 OWNER 可创建门店');
    return this.db.store.create({
      data: {
        ...parse(storeInput, body),
        merchantId: r.identity.merchantId,
        brandId: r.identity.brandId,
      },
    });
  }
  @Get('store') store(@Req() r: AdminRequest) {
    return this.db.store.findFirstOrThrow({
      where: {
        id: r.scope.storeId,
        merchantId: r.scope.merchantId,
        brandId: r.scope.brandId,
        deletedAt: null,
      },
    });
  }
  @Patch('store') @CatalogAccess() editStore(
    @Req() r: AdminRequest,
    @Body() body: unknown,
  ) {
    if (r.identity.role !== 'OWNER') throw new ForbiddenException();
    return this.db.store.update({
      where: {
        merchantId_brandId_id: {
          merchantId: r.scope.merchantId,
          brandId: r.scope.brandId,
          id: r.scope.storeId,
        },
      },
      data: parse(storeInput.partial().strict(), body),
    });
  }
  @Delete('store') @CatalogAccess() async archiveStore(
    @Req() r: AdminRequest,
    @Body() body: unknown,
  ) {
    if (r.identity.role !== 'OWNER')
      throw new ForbiddenException('仅老板可归档门店');
    const data = parse(
      z.object({ confirmationName: z.string().min(1) }).strict(),
      body,
    );
    return this.db.store.update({
      where: {
        id: r.scope.storeId,
        merchantId: r.scope.merchantId,
        brandId: r.scope.brandId,
        name: data.confirmationName,
        deletedAt: null,
      },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
  }
  private async checkImage(r: AdminRequest, imageUrl?: string) {
    if (!imageUrl) return;
    if (!imageUrl.startsWith('/api/v1/admin/media/'))
      throw new ForbiddenException('请使用本店上传的商品图片');
    await this.db.mediaAsset.findFirstOrThrow({
      where: { ...r.scope, id: imageUrl.slice('/api/v1/admin/media/'.length) },
    });
  }
  @Post('products/simple') @CatalogAccess() async simpleProduct(
    @Req() r: AdminRequest,
    @Body() body: unknown,
  ) {
    const { salePriceFen, ...data } = parse(
      productInput.extend({ salePriceFen: money }),
      body,
    );
    await this.checkImage(r, data.imageUrl);
    return this.db.$transaction(async (tx) => {
      await tx.category.findFirstOrThrow({
        where: { ...r.scope, id: data.categoryId, deletedAt: null },
      });
      const product = await tx.product.create({
        data: { ...r.scope, ...data },
      });
      await tx.variant.create({
        data: {
          ...r.scope,
          productId: product.id,
          name: '默认规格',
          salePriceFen,
          unlimitedStock: true,
        },
      });
      return product;
    });
  }
  @Get('categories') categories(@Req() r: AdminRequest) {
    return this.db.category.findMany({
      where: { ...r.scope, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }
  @Post('categories') @CatalogAccess() category(
    @Req() r: AdminRequest,
    @Body() body: unknown,
  ) {
    return this.db.category.create({
      data: { ...r.scope, ...parse(categoryInput, body) },
    });
  }
  @Patch('categories/:id') @CatalogAccess() editCategory(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    return this.db.category.update({
      where: {
        storeId_id: { storeId: r.scope.storeId, id: parse(id, value) },
        ...r.scope,
        deletedAt: null,
      },
      data: parse(categoryInput.partial().strict(), body),
    });
  }
  @Get('products') products(@Req() r: AdminRequest) {
    return this.db.product.findMany({
      where: { ...r.scope, deletedAt: null },
      include: {
        variantRecords: { where: { ...r.scope, deletedAt: null } },
        modifierGroupRecords: {
          where: r.scope,
          include: {
            modifierRecords: {
              where: r.scope,
              select: {
                id: true,
                name: true,
                salePriceFen: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
  @Get('products/:id') async product(
    @Req() r: AdminRequest,
    @Param('id') value: string,
  ) {
    const p = await this.db.product.findFirst({
      where: { ...r.scope, id: parse(id, value), deletedAt: null },
      include: { variantRecords: { where: { ...r.scope, deletedAt: null } } },
    });
    if (!p) throw new NotFoundException();
    return p;
  }
  @Post('products') @CatalogAccess() async createProduct(
    @Req() r: AdminRequest,
    @Body() body: unknown,
  ) {
    const data = parse(productInput, body);
    await this.checkImage(r, data.imageUrl);
    await this.db.category.findFirstOrThrow({
      where: { ...r.scope, id: data.categoryId, deletedAt: null },
    });
    return this.db.product.create({ data: { ...r.scope, ...data } });
  }
  @Patch('products/:id') @CatalogAccess() async editProduct(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    const data = parse(productInput.partial().strict(), body);
    const current = await this.db.product.findFirstOrThrow({
      where: { ...r.scope, id: parse(id, value), deletedAt: null },
    });
    // Keep an existing legacy URL unchanged; new images must be owned uploads.
    if (data.imageUrl !== current.imageUrl)
      await this.checkImage(r, data.imageUrl);
    if (data.categoryId)
      await this.db.category.findFirstOrThrow({
        where: { ...r.scope, id: data.categoryId, deletedAt: null },
      });
    return this.db.product.update({
      where: {
        storeId_id: { storeId: r.scope.storeId, id: parse(id, value) },
        ...r.scope,
        deletedAt: null,
      },
      data,
    });
  }
  @Delete('products/:id') @CatalogAccess() removeProduct(
    @Req() r: AdminRequest,
    @Param('id') value: string,
  ) {
    return this.db.product.update({
      where: {
        storeId_id: { storeId: r.scope.storeId, id: parse(id, value) },
        ...r.scope,
        deletedAt: null,
      },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
  }
  @Post('products/:id/variants') @CatalogAccess() async variant(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    const productId = parse(id, value);
    const data = parse(variantInput, body);
    await this.db.product.findFirstOrThrow({
      where: { ...r.scope, id: productId, deletedAt: null },
    });
    return this.db.variant.create({ data: { ...r.scope, productId, ...data } });
  }
  @Patch('variants/:id') @CatalogAccess() editVariant(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    return this.db.variant.update({
      where: {
        storeId_id: { storeId: r.scope.storeId, id: parse(id, value) },
        ...r.scope,
        deletedAt: null,
        product: { deletedAt: null },
      },
      data: parse(variantEdit, body),
    });
  }
  @Delete('variants/:id') @CatalogAccess() archiveVariant(
    @Req() r: AdminRequest,
    @Param('id') value: string,
  ) {
    return this.db.variant.update({
      where: {
        id: parse(id, value),
        ...r.scope,
        deletedAt: null,
        product: { deletedAt: null },
      },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
  }
  @Post('variants/:id/stock') @CatalogAccess() async stock(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    const variantId = parse(id, value),
      data = parse(
        z
          .object({
            delta: z
              .number()
              .int()
              .min(-2147483647)
              .max(2147483647)
              .refine((v) => v !== 0),
            reason: z.string().trim().min(1).max(500),
          })
          .strict(),
        body,
      );
    return this.db.$transaction(async (tx) => {
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
        throw new ConflictException('库存不足、超出范围或 SKU 不存在');
      await tx.inventoryMovement.create({
        data: { ...r.scope, variantId, ...data, actor: r.identity.id },
      });
      return tx.variant.findFirstOrThrow({
        where: { ...r.scope, id: variantId },
      });
    });
  }
  @Post('products/:id/modifier-groups') @CatalogAccess() async group(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    const productId = parse(id, value);
    await this.db.product.findFirstOrThrow({
      where: { ...r.scope, id: productId, deletedAt: null },
    });
    return this.db.modifierGroup.create({
      data: { ...r.scope, productId, ...parse(groupInput, body) },
    });
  }
  @Post('modifier-groups/:id/modifiers') @CatalogAccess() async modifier(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    const groupId = parse(id, value);
    await this.db.modifierGroup.findFirstOrThrow({
      where: { ...r.scope, id: groupId, product: { deletedAt: null } },
    });
    return this.db.modifier.create({
      data: { ...r.scope, groupId, ...parse(modifierInput, body) },
      select: { id: true, name: true, salePriceFen: true, status: true },
    });
  }
  @Patch('modifiers/:id') @CatalogAccess() editModifier(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Body() body: unknown,
  ) {
    return this.db.modifier.update({
      where: {
        storeId_id: { storeId: r.scope.storeId, id: parse(id, value) },
        ...r.scope,
      },
      data: parse(modifierInput.partial().strict(), body),
      select: { id: true, name: true, salePriceFen: true, status: true },
    });
  }
}
