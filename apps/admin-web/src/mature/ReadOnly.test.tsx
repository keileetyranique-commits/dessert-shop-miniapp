import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MerchantRoutes } from './App';
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const session = {
  id: 'user',
  role: 'OWNER',
  merchantId: 'merchant',
  brandId: 'brand',
  storeIds: '*',
};
const stores = [
  { id: 'a', name: '一店', status: 'ACTIVE' },
  { id: 'b', name: '二店', status: 'ACTIVE' },
];
const products = [
  {
    id: 'p',
    name: '真实商品',
    description: '香甜描述',
    categoryId: 'c',
    status: 'ACTIVE',
    imageUrl: 'https://example.com/photo.jpg',
    variantRecords: [{ status: 'ACTIVE', salePriceFen: 1880 }],
  },
  {
    id: 'multi',
    name: '多规格',
    categoryId: 'd',
    status: 'INACTIVE',
    variantRecords: [
      { status: 'ACTIVE', salePriceFen: 2500 },
      { status: 'ACTIVE', salePriceFen: 1800 },
      { status: 'INACTIVE', salePriceFen: 1 },
    ],
  },
  { id: 'empty', name: '没有规格', status: 'ACTIVE', variantRecords: [] },
];
function mockApi(list = stores) {
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const store = (init.headers as Record<string, string>)['X-Store-Id'];
    const body = url.endsWith('/session')
      ? session
      : url.endsWith('/stores')
        ? list
        : url.endsWith('/categories')
          ? [
              { id: 'c', name: '饮品' },
              { id: 'd', name: '其他分类' },
            ]
          : store === 'b'
            ? [{ ...products[0], name: '二店商品' }]
            : products;
    return new Response(JSON.stringify(body));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
async function login() {
  render(
    <MemoryRouter initialEntries={['/admin/products']}>
      <MerchantRoutes />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('后台访问凭据'), {
    target: { value: 'test-only-token' },
  });
  fireEvent.click(screen.getByRole('button', { name: '登录' }));
  await screen.findByLabelText('当前门店');
}
test('凭据登录、门店选择、真实分类商品和价格映射，所有请求只读', async () => {
  const fetch = mockApi();
  await login();
  expect(screen.getByText('请先在顶部选择门店')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('当前门店'), {
    target: { value: 'a' },
  });
  await screen.findByText('真实商品');
  expect(screen.getByText('¥18.80')).toBeTruthy();
  expect(screen.getByText('¥18.00 起')).toBeTruthy();
  expect(screen.getByText('待设置')).toBeTruthy();
  expect(screen.getByText('已下架')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('分类筛选'), {
    target: { value: 'd' },
  });
  expect(screen.queryByText('真实商品')).toBeNull();
  expect(screen.getByText('多规格')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('分类筛选'), {
    target: { value: '' },
  });
  for (const value of ['真实商品', '香甜描述', '饮品']) {
    fireEvent.change(screen.getByLabelText('搜索商品'), { target: { value } });
    expect(screen.getByText('真实商品')).toBeTruthy();
    expect(screen.queryByText('多规格')).toBeNull();
  }
  fireEvent.error(screen.getByRole('img', { name: '真实商品' }));
  expect(screen.queryByRole('img')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  expect(
    (
      within(screen.getByRole('dialog')).getByRole('button', {
        name: '保存商品',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '关闭编辑窗口' }));
  fireEvent.change(screen.getByLabelText('当前门店'), {
    target: { value: 'b' },
  });
  expect(screen.queryByText('真实商品')).toBeNull();
  await screen.findByText('二店商品');
  for (const [url, init] of fetch.mock.calls) {
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-only-token',
    );
    if (/categories|products/.test(url))
      expect(['a', 'b']).toContain(
        (init.headers as Record<string, string>)['X-Store-Id'],
      );
  }
  expect(
    fetch.mock.calls.filter(
      ([url, init]) =>
        /categories|products/.test(url) &&
        (init.headers as Record<string, string>)['X-Store-Id'] === 'b',
    ),
  ).toHaveLength(2);
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: '退出' }));
  expect(screen.getByLabelText('后台访问凭据')).toBeTruthy();
  expect(screen.queryByText('二店商品')).toBeNull();
});
test('单门店自动选择，无门店不请求商品', async () => {
  mockApi([stores[0]!]);
  await login();
  await screen.findByText('真实商品');
  expect((screen.getByLabelText('当前门店') as HTMLSelectElement).value).toBe(
    'a',
  );
  cleanup();
  const fetch = mockApi([]);
  await login();
  expect(screen.getAllByText('当前没有可用门店').length).toBeGreaterThan(0);
  expect(fetch).toHaveBeenCalledTimes(2);
});
test.each([401, 403, 500, 0, 200])(
  '读取错误不会显示为空列表，状态 %s',
  async (status) => {
    const fetch = mockApi([stores[0]!]);
    const original = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => {
      if (url.endsWith('/products')) {
        if (!status) throw new Error('secret network details');
        return new Response(status === 200 ? '' : '<html>raw error</html>', {
          status,
        });
      }
      return original(url, init);
    });
    await login();
    await screen.findByText(
      status === 401
        ? '登录已失效，请重新登录'
        : status === 403
          ? '你没有查看当前门店数据的权限，请联系管理员'
          : '商品暂时无法加载，请稍后重试',
    );
    expect(screen.queryByText('暂无商品数据')).toBeNull();
    expect(screen.queryByText('raw error')).toBeNull();
  },
);
test('旧门店慢请求不会覆盖新门店', async () => {
  const fetch = mockApi();
  const original = fetch.getMockImplementation()!;
  let complete!: (response: Response) => void;
  fetch.mockImplementation((url, init) =>
    url.endsWith('/products') &&
    (init.headers as Record<string, string>)['X-Store-Id'] === 'a'
      ? new Promise((resolve) => {
          complete = resolve;
        })
      : original(url, init),
  );
  await login();
  fireEvent.change(screen.getByLabelText('当前门店'), {
    target: { value: 'a' },
  });
  await screen.findByText('商品加载中…');
  fireEvent.change(screen.getByLabelText('当前门店'), {
    target: { value: 'b' },
  });
  await screen.findByText('二店商品');
  complete(new Response(JSON.stringify(products)));
  await waitFor(() => expect(screen.queryByText('真实商品')).toBeNull());
});

test('登录后首页仍保留八个导航和真实空状态；无效凭据不进入后台', async () => {
  mockApi([]);
  await login();
  const nav = within(screen.getByRole('navigation', { name: '商家后台导航' }));
  for (const name of [
    '首页',
    '商品',
    '订单',
    '库存',
    '营销',
    '配送',
    '经营分析',
    '门店设置',
  ])
    expect(nav.getByRole('link', { name })).toBeTruthy();
  fireEvent.click(nav.getByRole('link', { name: '首页' }));
  expect(screen.getAllByText('—')).toHaveLength(4);
  fireEvent.click(nav.getByRole('link', { name: '订单' }));
  expect(screen.getByText('该功能将在后续阶段接入')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '退出' }));
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })),
  );
  fireEvent.change(screen.getByLabelText('后台访问凭据'), {
    target: { value: 'invalid-test-only' },
  });
  fireEvent.click(screen.getByRole('button', { name: '登录' }));
  await screen.findByText('后台访问凭据无效或已失效，请重新登录');
  expect(screen.queryByRole('navigation')).toBeNull();
});

function writableApi(role = 'MANAGER', fail = false) {
  let product = {
    ...products[0]!,
    variantRecords: [{ id: 'v', status: 'ACTIVE', salePriceFen: 1880 }],
  };
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    let body: unknown;
    if (url.endsWith('/session')) body = { ...session, role };
    else if (url.endsWith('/stores')) body = [stores[0]];
    else if (url.endsWith('/categories'))
      body = [
        { id: 'c', name: '饮品' },
        { id: 'd', name: '其他分类' },
      ];
    else if (url.endsWith('/products/simple')) {
      if (fail)
        return new Response('<html>private error</html>', { status: 500 });
      const input = JSON.parse(init.body as string);
      product = {
        ...input,
        id: 'new',
        variantRecords: [
          { id: 'v', status: 'ACTIVE', salePriceFen: input.salePriceFen },
        ],
      };
      body = product;
    } else if (init.method === 'PATCH') {
      const input = JSON.parse(init.body as string);
      if (url.includes('/variants/')) {
        product.variantRecords[0] = { ...product.variantRecords[0]!, ...input };
        body = product.variantRecords[0];
      } else {
        product = { ...product, ...input };
        body = product;
      }
    } else if (url.endsWith('/products')) body = [product];
    else body = product;
    return new Response(JSON.stringify(body));
  });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
test('新增商品保存真实接口返回的数据，列表立即更新', async () => {
  const fetch = writableApi();
  await login();
  await screen.findByText('真实商品');
  fireEvent.click(screen.getByRole('button', { name: '新增商品' }));
  fireEvent.change(screen.getByLabelText('商品名称'), {
    target: { value: '新商品' },
  });
  fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('分类'), {
    target: { value: 'c' },
  });
  fireEvent.change(screen.getByLabelText('售价（元）'), {
    target: { value: '18.80' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存商品' }));
  await screen.findByText('商品已保存');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByText('新商品')).toBeTruthy();
  const write = fetch.mock.calls.find(([url]) =>
    url.endsWith('/products/simple'),
  )!;
  expect(JSON.parse(write[1].body as string)).toEqual({
    name: '新商品',
    categoryId: 'c',
    description: '',
    imageUrl: '',
    status: 'ACTIVE',
    salePriceFen: 1880,
  });
  expect(write[1].headers).toMatchObject({
    'X-Store-Id': 'a',
    Authorization: 'Bearer test-only-token',
  });
});
test('编辑名称分类描述状态和单规格售价后立即更新列表', async () => {
  const fetch = writableApi();
  await login();
  await screen.findByText('真实商品');
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  fireEvent.change(screen.getByLabelText('商品名称'), {
    target: { value: '编辑商品' },
  });
  fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('分类'), {
    target: { value: 'd' },
  });
  fireEvent.change(screen.getByLabelText('商品描述'), {
    target: { value: '新说明' },
  });
  fireEvent.change(screen.getByLabelText('上架状态'), {
    target: { value: 'INACTIVE' },
  });
  fireEvent.change(screen.getByLabelText('售价（元）'), {
    target: { value: '19.99' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存商品' }));
  await screen.findByText('商品已保存');
  expect(screen.getByText('编辑商品')).toBeTruthy();
  expect(screen.getByText('¥19.99')).toBeTruthy();
  expect(screen.getByText('已下架')).toBeTruthy();
  const writes = fetch.mock.calls.filter(([, init]) => init.method === 'PATCH');
  expect(writes.map(([, init]) => JSON.parse(init.body as string))).toEqual([
    {
      name: '编辑商品',
      categoryId: 'd',
      description: '新说明',
      status: 'INACTIVE',
    },
    { salePriceFen: 1999 },
  ]);
});
test('保存失败保留表单且不显示成功，只读角色不能新增编辑', async () => {
  writableApi('MANAGER', true);
  await login();
  await screen.findByText('真实商品');
  fireEvent.click(screen.getByRole('button', { name: '新增商品' }));
  fireEvent.change(screen.getByLabelText('商品名称'), {
    target: { value: '失败商品' },
  });
  fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('分类'), {
    target: { value: 'c' },
  });
  fireEvent.change(screen.getByLabelText('售价（元）'), {
    target: { value: '1' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存商品' }));
  expect(await screen.findByText('商品保存失败，请稍后重试')).toBeTruthy();
  expect(screen.queryByText('商品已保存')).toBeNull();
  cleanup();
  writableApi('COST_MANAGER');
  await login();
  await screen.findByText('真实商品');
  expect(
    (screen.getByRole('button', { name: '新增商品' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  expect(
    (screen.getByRole('button', { name: '保存商品' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.queryByLabelText('选择图片')).toBeNull();
});
test('多规格商品不提供价格输入框', async () => {
  mockApi([stores[0]!]);
  await login();
  await screen.findByText('多规格');
  const row = screen.getByText('多规格').closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: '编辑' }));
  expect(screen.getByText('多规格商品，请到规格管理中修改价格')).toBeTruthy();
  expect(screen.queryByLabelText('售价（元）')).toBeNull();
});
