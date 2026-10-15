import type { Named, Product } from '../admin-types';
export function formatFen(fen: number) {
  return '¥' + Math.floor(fen / 100) + '.' + String(fen % 100).padStart(2, '0');
}
export function productState(p: Product) {
  if (p.status !== 'ACTIVE') return 'inactive';
  const variants = p.variantRecords.filter((v) => v.status === 'ACTIVE');
  return variants.length &&
    variants.every(
      (v) => v.soldOut || (!v.unlimitedStock && v.stockQuantity === 0),
    )
    ? 'soldout'
    : 'active';
}
export function filterProducts(
  products: Product[],
  categories: Named[],
  query: string,
  category: string,
  state: string,
) {
  return products.filter(
    (p) =>
      (!category || p.categoryId === category) &&
      (state === 'all' || productState(p) === state) &&
      [
        p.name,
        p.description,
        categories.find((c) => c.id === p.categoryId)?.name ?? '',
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
}
