import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { PrismaClient } from '@prisma/client';
import { createApp } from './app.js';
import { parseConfig } from './config.js';
test('图片上传、读取和商品绑定遵守生产权限及完整租户边界', async () => {
  const config = parseConfig(process.env);
  assert.equal(config.environment, 'test');
  assert.match(new URL(config.databaseUrl).pathname, /test/);
  const db = new PrismaClient({
    datasources: { db: { url: config.databaseUrl } },
  });
  const root = await mkdtemp(join(tmpdir(), 'product-media-test-'));
  const previous = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = root;
  const merchants = [randomUUID(), randomUUID()];
  const brands = [randomUUID(), randomUUID(), randomUUID()];
  const scopes = [
    { merchantId: merchants[0]!, brandId: brands[0]!, storeId: randomUUID() },
    { merchantId: merchants[0]!, brandId: brands[0]!, storeId: randomUUID() },
    { merchantId: merchants[0]!, brandId: brands[1]!, storeId: randomUUID() },
    { merchantId: merchants[1]!, brandId: brands[2]!, storeId: randomUUID() },
  ];
  const tokens = Array.from({ length: 6 }, () =>
    randomBytes(32).toString('hex'),
  );
  const identities = scopes.map((scope, i) => ({
    id: 'owner' + i,
    token: tokens[i],
    merchantId: scope.merchantId,
    brandId: scope.brandId,
    storeIds: [scope.storeId],
    role: 'OWNER',
  }));
  for (const [i, role] of [
    [4, 'MANAGER'],
    [5, 'COST_MANAGER'],
  ] as const)
    identities.push({ ...identities[0]!, id: role, role, token: tokens[i] });
  let app: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    for (const id of merchants)
      await db.merchant.create({ data: { id, name: '图片测试商户' } });
    for (let i = 0; i < 3; i++)
      await db.brand.create({
        data: {
          id: brands[i]!,
          merchantId: merchants[i === 2 ? 1 : 0]!,
          name: '图片测试品牌',
        },
      });
    const productIds: string[] = [];
    for (const scope of scopes) {
      await db.store.create({
        data: {
          id: scope.storeId,
          merchantId: scope.merchantId,
          brandId: scope.brandId,
          name: '图片测试门店',
        },
      });
      const category = await db.category.create({
        data: { ...scope, name: '测试分类' },
      });
      const product = await db.product.create({
        data: {
          ...scope,
          categoryId: category.id,
          name: '名称不得变化',
          description: '描述不得变化',
          status: 'INACTIVE',
        },
      });
      productIds.push(product.id);
      await db.variant.create({
        data: {
          ...scope,
          productId: product.id,
          name: '规格',
          salePriceFen: 1880,
        },
      });
    }
    app = await createApp(
      parseConfig({
        ...process.env,
        APP_ENV: 'production',
        NODE_ENV: 'production',
        TEST_MODE: 'false',
        ADMIN_IDENTITIES: JSON.stringify(identities),
      }),
    );
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const headers = (i = 0, store = scopes[Math.min(i, 3)]!.storeId) => ({
      Authorization: 'Bearer ' + tokens[i],
      'X-Store-Id': store,
    });
    async function upload(
      buffer: Buffer,
      name = '图片.png',
      type = 'image/png',
      i = 0,
      store = scopes[0]!.storeId,
    ) {
      const body = new FormData();
      body.append('file', new Blob([new Uint8Array(buffer)], { type }), name);
      return fetch(base + '/api/v1/admin/media', {
        method: 'POST',
        headers: headers(i, store),
        body,
      });
    }
    const png = await sharp({
      create: { width: 3, height: 2, channels: 3, background: '#fa0' },
    })
      .png()
      .toBuffer();
    assert.equal((await upload(png, 'x.png', 'image/png', 5)).status, 403);
    assert.equal(
      (await upload(png, 'x.png', 'image/png', 0, scopes[1]!.storeId)).status,
      403,
    );
    assert.equal(
      (await fetch(base + '/api/v1/admin/media', { method: 'POST' })).status,
      401,
    );
    for (const [name, type, bytes] of [
      ['x.svg', 'image/svg+xml', png],
      ['x.jpg', 'image/jpeg', png],
      ['x.png', 'text/html', png],
      ['../x.png', 'image/png', png],
      ['x.png', 'image/png', png.subarray(0, 15)],
    ] as const)
      assert.equal((await upload(bytes, name, type)).status, 400);
    assert.equal((await upload(Buffer.alloc(5 * 1024 * 1024 + 1))).status, 413);
    let imageUrl = '';
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const bytes = await sharp(png).toFormat(format).toBuffer();
      const response = await upload(
        bytes,
        '图片.' + (format === 'jpeg' ? 'jpg' : format),
        'image/' + format,
        4,
      );
      assert.equal(response.status, 201);
      const asset = await response.json();
      imageUrl = asset.imageUrl;
      const read = await fetch(base + imageUrl, { headers: headers() });
      assert.equal(read.status, 200);
      assert.equal(read.headers.get('cache-control'), 'no-store');
      assert.equal(read.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(
        (await sharp(Buffer.from(await read.arrayBuffer())).metadata()).format,
        'webp',
      );
      const record = await db.mediaAsset.findUniqueOrThrow({
        where: { id: asset.id },
      });
      assert.equal(record.merchantId, scopes[0]!.merchantId);
      assert.equal(record.storeId, scopes[0]!.storeId);
      assert.ok(record.storageKey.endsWith(asset.id + '.webp'));
      assert.ok(!record.storageKey.includes('图片'));
      for (let i = 1; i < 4; i++)
        assert.equal(
          (await fetch(base + imageUrl, { headers: headers(i) })).status,
          404,
        );
    }
    async function patch(
      index: number,
      value: string,
      identity = index,
      store = scopes[index]!.storeId,
    ) {
      return fetch(base + '/api/v1/admin/products/' + productIds[index], {
        method: 'PATCH',
        headers: {
          ...headers(identity, store),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageUrl: value }),
      });
    }
    for (let i = 1; i < 4; i++)
      assert.equal((await patch(i, imageUrl)).status, 404);
    assert.equal((await patch(0, imageUrl, 1, scopes[1]!.storeId)).status, 404);
    assert.equal((await patch(0, imageUrl, 5, scopes[0]!.storeId)).status, 403);
    const before = await db.product.findUniqueOrThrow({
      where: { id: productIds[0] },
    });
    assert.equal((await patch(0, imageUrl, 4, scopes[0]!.storeId)).status, 200);
    const after = await db.product.findUniqueOrThrow({
      where: { id: productIds[0] },
    });
    assert.equal(after.imageUrl, imageUrl);
    for (const key of ['name', 'categoryId', 'description', 'status'] as const)
      assert.equal(after[key], before[key]);
    assert.equal(
      (
        await db.variant.findFirstOrThrow({
          where: { productId: productIds[0] },
        })
      ).salePriceFen,
      1880,
    );
    assert.equal((await patch(0, '')).status, 200);
    assert.equal(
      (await db.product.findUniqueOrThrow({ where: { id: productIds[0] } }))
        .imageUrl,
      '',
    );
    assert.equal(await db.mediaAsset.count({ where: scopes[0] }), 3);
    await assert.rejects(
      db.mediaAsset.create({
        data: {
          ...scopes[0]!,
          brandId: brands[2]!,
          storageKey: randomUUID(),
          mimeType: 'image/webp',
          size: 1,
        },
      }),
    );
  } finally {
    if (app) await app.close();
    const where = { merchantId: { in: merchants } };
    await db.mediaAsset.deleteMany({ where });
    await db.variant.deleteMany({ where });
    await db.product.deleteMany({ where });
    await db.category.deleteMany({ where });
    await db.store.deleteMany({ where });
    await db.brand.deleteMany({ where });
    await db.merchant.deleteMany({ where: { id: { in: merchants } } });
    await db.$disconnect();
    if (previous === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previous;
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
    assert.ok(root.includes('product-media-test-'));
    await rm(root, { recursive: true, force: true });
  }
});
