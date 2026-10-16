import { expect, test, vi } from 'vitest';
import { yuanToFen, saveProduct } from './product-save';
test.each([
  ['18', 1800],
  ['18.8', 1880],
  ['18.80', 1880],
  ['0.01', 1],
  ['0', 0],
  ['21474836.47', 2147483647],
])('金额精确转换 %s', (value, result) =>
  expect(yuanToFen(value as string)).toBe(result),
);
test.each(['', '-1', '1.001', '1e2', 'abc', '21474836.48'])(
  '拒绝非法或越界金额 %s',
  (value) => expect(() => yuanToFen(value)).toThrow(),
);
const draft = {
  title: '商品',
  category_id: 'c',
  description: '说明',
  image: '',
  available: true,
  price: '18.80',
};
test('新增只提交允许字段，售价为整数分', async () => {
  const api = vi.fn().mockResolvedValue({ id: 'p' });
  await saveProduct(api, draft);
  expect(api).toHaveBeenCalledWith('/products/simple', 'POST', {
    name: '商品',
    categoryId: 'c',
    description: '说明',
    imageUrl: '',
    status: 'ACTIVE',
    salePriceFen: 1880,
  });
});
test('编辑只发送修改字段与单规格售价，禁止透传返回字段', async () => {
  const current = {
    id: 'p',
    name: '旧名',
    categoryId: 'c',
    description: '说明',
    imageUrl: '',
    status: 'ACTIVE',
    variantRecords: [{ id: 'v', status: 'ACTIVE', salePriceFen: 100 }],
    inventory: 'private',
  };
  const api = vi
    .fn()
    .mockResolvedValueOnce(current)
    .mockResolvedValueOnce({ ...current, name: '商品' })
    .mockResolvedValueOnce({ id: 'v', status: 'ACTIVE', salePriceFen: 1880 });
  await saveProduct(api, draft, 'p');
  expect(api.mock.calls).toEqual([
    ['/products/p'],
    ['/products/p', 'PATCH', { name: '商品' }],
    ['/variants/v', 'PATCH', { salePriceFen: 1880 }],
  ]);
});
test('多个有效规格不会发送价格更新', async () => {
  const current = {
    id: 'p',
    name: '商品',
    categoryId: 'c',
    description: '说明',
    imageUrl: '',
    status: 'ACTIVE',
    variantRecords: [
      { id: 'a', status: 'ACTIVE', salePriceFen: 100 },
      { id: 'b', status: 'ACTIVE', salePriceFen: 200 },
    ],
  };
  const api = vi.fn().mockResolvedValue(current);
  await saveProduct(api, { ...draft, price: '' }, 'p');
  expect(api).toHaveBeenCalledTimes(1);
});
test('保存失败不返回成功，部分成功明确提示', async () => {
  const api = vi.fn().mockRejectedValue(new Error('private'));
  await expect(saveProduct(api, draft)).rejects.toThrow('商品保存失败');
  api
    .mockReset()
    .mockResolvedValueOnce({
      name: '旧名',
      categoryId: 'c',
      description: '说明',
      imageUrl: '',
      status: 'ACTIVE',
      variantRecords: [{ id: 'v', status: 'ACTIVE', salePriceFen: 1 }],
    })
    .mockResolvedValueOnce({ name: '商品' })
    .mockRejectedValueOnce(new Error('private'));
  await expect(saveProduct(api, draft, 'p')).rejects.toThrow(
    '商品资料已保存，但售价未保存',
  );
});

test('未修改字段不会覆盖别人已经更新的资料或售价', async () => {
  const current = {
    id: 'p',
    name: '别人改名',
    categoryId: 'c',
    description: '说明',
    imageUrl: '',
    status: 'ACTIVE',
    variantRecords: [{ id: 'v', status: 'ACTIVE', salePriceFen: 2000 }],
  };
  const api = vi.fn().mockResolvedValue(current);
  await saveProduct(api, draft, 'p', draft);
  expect(api.mock.calls).toEqual([['/products/p']]);
});
test.each([
  { title: '' },
  { category_id: '' },
  { description: 'x'.repeat(4001) },
])('无效商品字段不发请求', async (invalid) => {
  const api = vi.fn();
  await expect(saveProduct(api, { ...draft, ...invalid })).rejects.toThrow();
  expect(api).not.toHaveBeenCalled();
});

test('保存前规格变为多个时阻止改价且不误报成功', async () => {
  const api = vi.fn().mockResolvedValue({
    variantRecords: [
      { id: 'a', status: 'ACTIVE' },
      { id: 'b', status: 'ACTIVE' },
    ],
  });
  await expect(saveProduct(api, draft, 'p')).rejects.toThrow('商品规格已变化');
  expect(api).toHaveBeenCalledTimes(1);
});
