import { expect, test } from 'vitest';
import { adaptProduct, publicImage } from './catalog-adapter';
import type { Product } from '../admin-types';
test('售价保留整数分、零值、上限，忽略归档或无效规格', () => {
  const map = (variantRecords: unknown[]) =>
    adaptProduct({
      id: 'p',
      name: '商品',
      status: 'ACTIVE',
      variantRecords,
    } as Product);
  expect(map([{ status: 'ACTIVE', salePriceFen: 0 }]).priceFen).toBe(0);
  expect(map([{ status: 'ACTIVE', salePriceFen: 2147483647 }]).priceFen).toBe(
    2147483647,
  );
  expect(
    map([
      { status: 'ACTIVE', salePriceFen: 0, deletedAt: '2026-01-01' },
      { status: 'INACTIVE', salePriceFen: 1 },
      { status: 'ACTIVE', salePriceFen: 1.1 },
      { status: 'ACTIVE', salePriceFen: -1 },
    ]).priceFen,
  ).toBeNull();
});
test('受保护媒体和非网页图片不直接加载，不携带凭据', () => {
  for (const value of [
    '/api/v1/admin/media/abc',
    'https://example.com/api/v1/admin/media/abc',
    'javascript:alert(1)',
    'data:image/png;base64,abc',
    'https://user:password@example.com/x',
  ])
    expect(publicImage(value)).toBe('');
  expect(publicImage('https://example.com/photo.webp')).toBe(
    'https://example.com/photo.webp',
  );
});
