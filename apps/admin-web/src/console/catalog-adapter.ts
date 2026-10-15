import { MEDIA_PATH } from './media-client';
import type { Product as ApiProduct } from '../admin-types';
export interface Product {
  id: string;
  category_id: string;
  title: string;
  description: string;
  image: string;
  available: boolean;
  priceFen: number | null;
  multiplePrices: boolean;
  singleVariantId?: string;
}
export function publicImage(value: string): string {
  if (!value) return '';
  try {
    const url = new URL(value, window.location.origin);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname.startsWith('/api/')
    )
      return '';
    return url.href;
  } catch {
    return '';
  }
}
export function adaptProduct(product: ApiProduct): Product {
  const variants = product.variantRecords.filter(
    (v) =>
      v.status === 'ACTIVE' &&
      !(v as typeof v & { deletedAt?: string }).deletedAt &&
      Number.isInteger(v.salePriceFen) &&
      v.salePriceFen >= 0 &&
      v.salePriceFen <= 2147483647,
  );
  return {
    id: product.id,
    category_id: product.categoryId,
    title: product.name,
    description: product.description ?? '',
    image: product.imageUrl
      ? MEDIA_PATH.test(product.imageUrl)
        ? product.imageUrl
        : publicImage(product.imageUrl)
      : '',
    available: product.status === 'ACTIVE',
    priceFen: variants.length
      ? variants.reduce((min, v) => Math.min(min, v.salePriceFen), 2147483647)
      : null,
    multiplePrices: variants.length > 1,
    singleVariantId: variants.length === 1 ? variants[0]!.id : undefined,
  };
}
