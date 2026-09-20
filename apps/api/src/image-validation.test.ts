import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { normalizeImage, MAX_IMAGE_BYTES } from './image-validation.js';
import { LocalStorage } from './storage.js';
test('图片必须匹配签名、类型和扩展名，解码后仅保留安全图像', async () => {
  for (const format of ['png', 'jpeg', 'webp'] as const) {
    const buffer = await sharp({
      create: { width: 2, height: 2, channels: 3, background: '#fff' },
    })
      .toFormat(format)
      .toBuffer();
    const file = {
      originalname: '商品.' + format,
      mimetype: 'image/' + format,
      buffer,
      size: buffer.length,
    };
    assert.equal(
      (await sharp(await normalizeImage(file)).metadata()).format,
      'webp',
    );
    for (const originalname of [
      '../x.' + format,
      'a/图片.' + format,
      'a\\x.' + format,
      'x.php.' + format,
      'x.svg',
      'C:x.' + format,
    ])
      await assert.rejects(normalizeImage({ ...file, originalname }));
    await assert.rejects(normalizeImage({ ...file, mimetype: 'text/html' }));
    await assert.rejects(
      normalizeImage({ ...file, size: MAX_IMAGE_BYTES + 1 }),
    );
    await assert.rejects(
      normalizeImage({
        ...file,
        buffer: Buffer.from('<script>alert(1)</script>'),
        size: 25,
      }),
    );
    await assert.rejects(
      normalizeImage({ ...file, buffer: buffer.subarray(0, 12), size: 12 }),
    );
  }
});
test('存储适配器拒绝调用方传入路径穿越标识', async () => {
  const storage = new LocalStorage('.test-media');
  await assert.rejects(storage.put('../../danger', Buffer.from('x')));
  assert.throws(() => storage.get('/etc/passwd'));
});
