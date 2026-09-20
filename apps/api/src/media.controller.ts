import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AdminGuard, CatalogAccess, type AdminRequest } from './auth.js';
import { DatabaseService } from './infrastructure.js';
import { STORAGE, type StorageAdapter } from './storage.js';
import { MAX_IMAGE_BYTES, normalizeImage } from './image-validation.js';
import { id, parse } from './validation.js';
@Controller('admin/media')
@UseGuards(AdminGuard)
export class MediaController {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(STORAGE) private storage: StorageAdapter,
  ) {}
  @Post()
  @CatalogAccess()
  @UseInterceptors(
    FileInterceptor('file', {
      preservePath: true,
      limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0, parts: 2 },
    }),
  )
  async upload(
    @Req() r: AdminRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('请选择一张图片');
    const data = await normalizeImage(file);
    const assetId = randomUUID();
    const key = `${r.scope.merchantId}/${r.scope.brandId}/${r.scope.storeId}/${assetId}.webp`;
    await this.storage.put(key, data);
    try {
      // Recheck after decoding so an archived store cannot accept a completed upload.
      await this.db.store.findFirstOrThrow({
        where: { id: r.scope.storeId, deletedAt: null },
      });
      await this.db.mediaAsset.create({
        data: {
          ...r.scope,
          id: assetId,
          storageKey: key,
          mimeType: 'image/webp',
          size: data.length,
        },
      });
    } catch (error) {
      await this.storage.remove(key);
      throw error;
    }
    return { id: assetId, imageUrl: '/api/v1/admin/media/' + assetId };
  }
  @Get(':id') async download(
    @Req() r: AdminRequest,
    @Param('id') value: string,
    @Res() response: Response,
  ) {
    const asset = await this.db.mediaAsset.findFirst({
      where: { ...r.scope, id: parse(id, value) },
    });
    if (!asset) throw new NotFoundException('图片不存在');
    let data: Buffer;
    try {
      data = await this.storage.get(asset.storageKey);
    } catch {
      throw new NotFoundException('图片不存在');
    }
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; sandbox",
    );
    response.setHeader(
      'Content-Disposition',
      'inline; filename="product.webp"',
    );
    response.type(asset.mimeType).send(data);
  }
}
