import { expect, test } from 'vitest';
import { filterProducts, productState, formatFen } from './catalog';
import type { Product } from '../admin-types';
const product = {
  id: 'p',
  name: '鲜果茶',
  description: '清爽',
  categoryId: 'c',
  status: 'ACTIVE',
  variantRecords: [
    {
      id: 'v',
      name: '默认规格',
      salePriceFen: 1880,
      status: 'ACTIVE',
      soldOut: false,
      unlimitedStock: true,
      stockQuantity: 0,
    },
  ],
  modifierGroupRecords: [],
  imageUrl: '',
} satisfies Product;
test('商品搜索覆盖名称、描述、分类，状态按真实规格判断', () => {
  expect(
    filterProducts([product], [{ id: 'c', name: '饮品' }], '饮品', '', 'all'),
  ).toHaveLength(1);
  expect(filterProducts([product], [], '清爽', '', 'all')).toHaveLength(1);
  expect(filterProducts([product], [], '甜点', '', 'all')).toHaveLength(0);
  expect(productState(product)).toBe('active');
  expect(
    productState({
      ...product,
      variantRecords: [
        { ...product.variantRecords[0]!, unlimitedStock: false },
      ],
    }),
  ).toBe('soldout');
  expect(productState({ ...product, status: 'INACTIVE' })).toBe('inactive');
  expect(formatFen(1880)).toBe('¥18.80');
});
