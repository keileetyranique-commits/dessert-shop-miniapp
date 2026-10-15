import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { ConsoleApp } from './App';
vi.setConfig({ testTimeout: 15000 });
let products: Record<string, unknown>[],
  role: string,
  stores: { id: string; name: string; status: string }[],
  fail: boolean;
const response = (body: unknown, status = 200) => ({
  ok: status < 400,
  status,
  text: async () => JSON.stringify(body),
  json: async () => body,
});
let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.history.replaceState({}, '', '/admin/products');
  const getStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => getStyle(el));
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  role = 'OWNER';
  stores = [{ id: 's1', name: '湖畔门店', status: 'ACTIVE' }];
  fail = false;
  products = [
    {
      id: 'p1',
      name: '鲜果茶',
      description: '清爽果香',
      categoryId: 'c1',
      status: 'ACTIVE',
      imageUrl: '',
      variantRecords: [
        {
          id: 'v1',
          name: '默认规格',
          salePriceFen: 1880,
          status: 'ACTIVE',
          unlimitedStock: true,
          stockQuantity: 0,
          soldOut: false,
        },
      ],
      modifierGroupRecords: [],
    },
  ];
  request = vi.fn(async (url: string, options?: RequestInit) => {
    const method = options?.method ?? 'GET';
    if (url.endsWith('/runtime')) return response({ testMode: true });
    if (url.endsWith('/session'))
      return response({ id: 'person', role, storeIds: '*' });
    if (url.endsWith('/stores')) return response(stores);
    if (url.endsWith('/categories'))
      return response([{ id: 'c1', name: '饮品', status: 'ACTIVE' }]);
    if (url.endsWith('/products/simple')) {
      if (fail) return response({}, 500);
      const body = JSON.parse(String(options?.body));
      const p = {
        ...body,
        id: 'p2',
        variantRecords: [
          {
            id: 'v2',
            name: '默认规格',
            salePriceFen: body.salePriceFen,
            status: 'ACTIVE',
            unlimitedStock: true,
          },
        ],
        modifierGroupRecords: [],
      };
      products.push(p);
      return response(p, 201);
    }
    if (url.endsWith('/products/p1') && method === 'DELETE') {
      products = [];
      return response({});
    }
    if (url.endsWith('/products/p1')) {
      if (method === 'PATCH')
        Object.assign(products[0]!, JSON.parse(String(options?.body)));
      return response(products[0]);
    }
    if (url.endsWith('/products'))
      return fail ? response({}, 500) : response(products);
    return response({});
  });
  vi.stubGlobal('fetch', request);
});

async function openNewProduct() {
  await login();
  await screen.findByText('鲜果茶');
  fireEvent.click(screen.getByRole('button', { name: /新增商品/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('商品名称'), {
    target: { value: '椰奶冻' },
  });
  fireEvent.change(within(dialog).getByLabelText('售价（元）'), {
    target: { value: '18.80' },
  });
  fireEvent.mouseDown(within(dialog).getByLabelText('商品分类'));
  fireEvent.click(document.querySelector('.ant-select-item-option-content')!);
  return dialog;
}
test('完整新增表单精确保存售价并刷新真实列表', async () => {
  const dialog = await openNewProduct();
  fireEvent.click(within(dialog).getByRole('button', { name: '保存商品' }));
  expect(
    await screen.findByText('商品已创建，默认规格已自动建立'),
  ).toBeTruthy();
  expect(screen.getByText('椰奶冻')).toBeTruthy();
  const call = request.mock.calls.find(([u]) => u.endsWith('/products/simple'));
  expect(JSON.parse(String(call?.[1]?.body))).toEqual({
    name: '椰奶冻',
    categoryId: 'c1',
    salePriceFen: 1880,
    description: '',
    imageUrl: '',
    status: 'ACTIVE',
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
test('新增保存失败保留输入且不误报成功', async () => {
  const dialog = await openNewProduct();
  fail = true;
  fireEvent.click(within(dialog).getByRole('button', { name: '保存商品' }));
  await within(dialog).findByRole('alert');
  expect(
    (within(dialog).getByLabelText('商品名称') as HTMLInputElement).value,
  ).toBe('椰奶冻');
  expect(screen.queryByText('商品已创建，默认规格已自动建立')).toBeNull();
});
test('编辑名称仅写修改字段，不覆盖规格和其他商品字段', async () => {
  await login();
  await screen.findByText('鲜果茶');
  fireEvent.click(screen.getByRole('button', { name: /编辑商品/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('商品名称'), {
    target: { value: '招牌果茶' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存商品' }));
  await screen.findByText('商品资料已保存');
  expect(screen.getByText('招牌果茶')).toBeTruthy();
  expect(
    request.mock.calls
      .filter(([, o]) => o?.method === 'PATCH')
      .map(([, o]) => JSON.parse(String(o?.body))),
  ).toEqual([{ name: '招牌果茶' }]);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function login() {
  render(<ConsoleApp />);
  fireEvent.change(screen.getByLabelText('后台访问凭据'), {
    target: { value: 'test-only' },
  });
  fireEvent.click(screen.getByRole('button', { name: '进入工作台' }));
  await screen.findByRole('navigation', { name: '主导航' });
}
test('真实门店自动选择，读取分类商品带门店头，中文价格与状态', async () => {
  await login();
  expect(await screen.findByText('鲜果茶')).toBeTruthy();
  expect(screen.getByText('¥18.80')).toBeTruthy();
  expect(screen.getByText('已上架')).toBeTruthy();
  for (const endpoint of ['/products', '/categories']) {
    const call = request.mock.calls.find(([url]) => url.endsWith(endpoint));
    expect(call?.[1]?.headers).toMatchObject({
      'X-Store-Id': 's1',
      Authorization: 'Bearer test-only',
    });
  }
  fireEvent.change(screen.getByRole('textbox', { name: '搜索商品' }), {
    target: { value: '不存在' },
  });
  expect(screen.getByText('没有符合筛选条件的商品')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: '搜索商品' }), {
    target: { value: '饮品' },
  });
  expect(screen.getByText('鲜果茶')).toBeTruthy();
});
test('多门店先选择，未选择不请求商品', async () => {
  stores.push({ id: 's2', name: '城南门店', status: 'ACTIVE' });
  await login();
  expect(await screen.findByText('请选择一家门店')).toBeTruthy();
  expect(request.mock.calls.some(([u]) => u.endsWith('/products'))).toBe(false);
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '当前门店' }));
  fireEvent.click(await screen.findByText('城南门店'));
  expect(await screen.findByText('鲜果茶')).toBeTruthy();
  expect(
    request.mock.calls.find(([u]) => u.endsWith('/products'))?.[1]?.headers,
  ).toMatchObject({ 'X-Store-Id': 's2' });
});
test('工作台没有订单时不伪造数字或排行', async () => {
  window.history.replaceState({}, '', '/admin');
  await login();
  expect(await screen.findByText('今日营业额')).toBeTruthy();
  expect(screen.getByText('暂无销量数据，暂不生成热销排行')).toBeTruthy();
  expect(screen.getAllByText('—')).toHaveLength(4);
});
test('接口失败显示错误，不误报空商品', async () => {
  fail = true;
  await login();
  expect(await screen.findByText('服务暂时不可用，请稍后重试')).toBeTruthy();
  expect(screen.queryByText('还没有商品，从添加第一款招牌开始')).toBeNull();
});
test('只读角色不出现商品新增、编辑、归档写入口', async () => {
  role = 'COST_MANAGER';
  await login();
  await screen.findByText('鲜果茶');
  expect(screen.queryByRole('button', { name: /新增商品/ })).toBeNull();
  expect(screen.queryByRole('button', { name: '编辑商品' })).toBeNull();
  expect(screen.queryByRole('button', { name: '归档' })).toBeNull();
});
test('新增取消选图不关弹窗，填写内容保留，不上传', async () => {
  await login();
  await screen.findByText('鲜果茶');
  fireEvent.click(screen.getByRole('button', { name: /新增商品/ }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('商品名称'), {
    target: { value: '椰奶冻' },
  });
  fireEvent.change(within(dialog).getByLabelText('售价（元）'), {
    target: { value: '18.80' },
  });
  const input = dialog.querySelector('input[type=file]')!;
  fireEvent(input, new Event('cancel', { bubbles: true }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(
    (within(dialog).getByLabelText('商品名称') as HTMLInputElement).value,
  ).toBe('椰奶冻');
  expect(
    (within(dialog).getByLabelText('售价（元）') as HTMLInputElement).value,
  ).toBe('18.80');
  expect(request.mock.calls.some(([u]) => u.endsWith('/media'))).toBe(false);
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
test('归档需要确认，成功后商品立即移出列表', async () => {
  await login();
  await screen.findByText('鲜果茶');
  fireEvent.click(screen.getByRole('button', { name: '归档' }));
  expect(request.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(
    false,
  );
  fireEvent.click(
    within(await screen.findByRole('dialog')).getByRole('button', {
      name: '确认',
    }),
  );
  expect(await screen.findByText('商品已归档，历史资料保留')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: '鲜果茶' })).toBeNull();
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
