import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Inventory } from './Inventory';
// N5095 development host: retain every assertion with a bounded allowance for Ant Design/jsdom.
vi.setConfig({ testTimeout: 30000 });
const api = vi.fn();
let canEdit = true;
let role = 'OWNER';
vi.mock('./Data', () => ({
  useCatalog: () => ({
    api,
    canEdit,
    categories: [{ id: 'cat', name: '饮品' }],
    products: [
      {
        id: 'p',
        name: '真实茶饮',
        variantRecords: [{ id: 'v', name: '标准' }],
      },
    ],
  }),
}));
vi.mock('./Session', () => ({
  useSession: () => ({ identity: { role } }),
}));
beforeEach(() => {
  canEdit = true;
  role = 'OWNER';
  const original = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el) => original(el));
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
  api.mockImplementation(async (path: string) =>
    path.startsWith('/inventory?')
      ? {
          items: [
            {
              id: 'v',
              productId: 'p',
              productName: '真实茶饮',
              name: '标准',
              salePriceFen: 1880,
              stockQuantity: 10,
              reservedQuantity: 3,
              available: 7,
              unlimitedStock: false,
              soldOut: false,
              lowStockThreshold: null,
              state: 'NORMAL',
              inventoryUpdatedAt: null,
            },
          ],
          total: 25,
          summary: {
            products: 1,
            finite: 1,
            unlimited: 0,
            normal: 1,
            empty: 0,
            low: 0,
            reserved: 3,
          },
        }
      : { items: [], total: 0 },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  api.mockReset();
});
test('真实数量、金额、搜索、筛选、分页与调整确认', async () => {
  render(<Inventory />);
  expect(await screen.findByText('真实茶饮')).toBeTruthy();
  expect(screen.getByText('¥18.80')).toBeTruthy();
  fireEvent.change(screen.getByPlaceholderText('搜索商品名称'), {
    target: { value: '茶' },
  });
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      expect.stringContaining('productSearch=%E8%8C%B6'),
    ),
  );
  fireEvent.click(screen.getByTitle('2'));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(expect.stringContaining('page=2')),
  );
  fireEvent.click(screen.getByRole('button', { name: '调整库存' }));
  fireEvent.click(screen.getByRole('button', { name: '确认提交' }));
  expect(await screen.findByText('请填写调整原因')).toBeTruthy();
  expect(api.mock.calls.some((c) => c[1] === 'POST')).toBe(false);
  fireEvent.change(screen.getByLabelText('调整原因（必填）'), {
    target: { value: '盘点补货' },
  });
  fireEvent.click(screen.getByRole('button', { name: '确认提交' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      '/variants/v/stock',
      'POST',
      expect.objectContaining({
        delta: 1,
        reason: '盘点补货',
        idempotencyKey: expect.any(String),
      }),
    ),
  );
  expect(await screen.findByText('库存操作已保存')).toBeTruthy();
});
test('失败保留弹窗和输入；只读角色不能调整', async () => {
  const original = api.getMockImplementation()!;
  api.mockImplementation((path, method, body) =>
    method === 'POST'
      ? Promise.reject(Error('库存已被待完成订单预占，不能减少到预占数量以下'))
      : original(path, method, body),
  );
  const view = render(<Inventory />);
  await screen.findByText('真实茶饮');
  fireEvent.click(screen.getByRole('button', { name: '调整库存' }));
  fireEvent.change(screen.getByLabelText('调整原因（必填）'), {
    target: { value: '盘点' },
  });
  fireEvent.click(screen.getByRole('button', { name: '确认提交' }));
  expect(
    await screen.findByText('库存已被待完成订单预占，不能减少到预占数量以下'),
  ).toBeTruthy();
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByDisplayValue('盘点')).toBeTruthy();
  view.unmount();
  canEdit = false;
  render(<Inventory />);
  await screen.findByText('真实茶饮');
  expect(screen.queryByRole('button', { name: '调整库存' })).toBeNull();
});
test('加载错误不能冒充空库存', async () => {
  api.mockRejectedValue(Error('网络连接失败，请检查网络后重试'));
  render(<Inventory />);
  expect(
    await screen.findByText('网络连接失败，请检查网络后重试'),
  ).toBeTruthy();
  expect(screen.queryByText('暂无库存数据')).toBeNull();
});

async function select(label: string, text: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: label }));
  const candidates = await screen.findAllByText(text);
  fireEvent.click(candidates[candidates.length - 1]!);
}
test('规格、分类、状态、模式、手动标记和排序传给服务端，筛选重置分页', async () => {
  render(<Inventory />);
  await screen.findByText('真实茶饮');
  fireEvent.click(screen.getByTitle('2'));
  fireEvent.change(screen.getByLabelText('搜索规格名称'), {
    target: { value: '标准' },
  });
  await select('分类筛选', '饮品');
  await select('库存状态筛选', '库存紧张');
  await select('库存模式筛选', '有限库存');
  await select('手动售罄筛选', '已手动售罄');
  await select('库存排序', '按可售数量');
  await select('排序方向', '降序');
  await waitFor(() => {
    const path = api.mock.calls.at(-1)![0] as string;
    const q = new URLSearchParams(path.split('?')[1]);
    expect(Object.fromEntries(q)).toMatchObject({
      page: '1',
      variantSearch: '标准',
      categoryId: 'cat',
      state: 'LOW',
      mode: 'finite',
      soldOut: 'true',
      sort: 'available',
      direction: 'desc',
    });
  });
});
test('预警零与清空不同，设置失败可重试且幂等键保持，保存刷新', async () => {
  const original = api.getMockImplementation()!;
  let failed = false;
  api.mockImplementation((path, method, body) => {
    if (method === 'PATCH' && !failed) {
      failed = true;
      return Promise.reject(Error('保存失败'));
    }
    return original(path, method, body);
  });
  render(<Inventory />);
  await screen.findByText('真实茶饮');
  fireEvent.click(screen.getByRole('button', { name: '设置预警' }));
  fireEvent.change(screen.getByLabelText('预警数量（选填，可清空）'), {
    target: { value: '0' },
  });
  fireEvent.change(screen.getByLabelText('调整原因（必填）'), {
    target: { value: '零库存也提醒' },
  });
  fireEvent.click(screen.getByRole('button', { name: '确认提交' }));
  await screen.findByText('保存失败');
  const first = api.mock.calls.find((c) => c[1] === 'PATCH')![2];
  expect(first.lowStockThreshold).toBe(0);
  expect(screen.queryByText('库存操作已保存')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '确认提交' }));
  await screen.findByText('库存操作已保存');
  expect(api.mock.calls.filter((c) => c[1] === 'PATCH')[1]![2]).toEqual(first);
  expect(
    api.mock.calls.filter((c) => c[0].startsWith('/inventory?')).length,
  ).toBeGreaterThan(1);
  fireEvent.click(screen.getByRole('button', { name: '设置预警' }));
  fireEvent.change(screen.getByLabelText('调整原因（必填）'), {
    target: { value: '清空预警' },
  });
  fireEvent.click(screen.getByRole('button', { name: '确认提交' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      '/inventory/variants/v',
      'PATCH',
      expect.objectContaining({ lowStockThreshold: null }),
    ),
  );
});
test('售罄确认、店长无阈值入口、不限库存与安全停售恢复边界', async () => {
  role = 'MANAGER';
  const original = api.getMockImplementation()!;
  let paused = false;
  api.mockImplementation(async (path, method, body) => {
    const value = await original(path, method, body);
    if (method === 'PATCH') paused = true;
    if (path.startsWith('/inventory?'))
      value.items[0] = {
        ...value.items[0],
        unlimitedStock: true,
        available: null,
        soldOut: paused,
        state: paused ? 'SAFETY' : 'NORMAL',
      };
    return value;
  });
  render(<Inventory />);
  await screen.findByText('真实茶饮');
  expect(screen.getAllByText('不限库存').length).toBe(2);
  expect(screen.queryByRole('button', { name: '调整库存' })).toBeNull();
  expect(screen.queryByRole('button', { name: '设置预警' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '标记售罄' }));
  expect(
    screen.getByText('标记后停止新销售，不修改已有订单或库存。'),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText('调整原因（必填）'), {
    target: { value: '检修' },
  });
  fireEvent.click(screen.getByRole('button', { name: '确认提交' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      '/inventory/variants/v',
      'PATCH',
      expect.objectContaining({ soldOut: true, reason: '检修' }),
    ),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: '恢复售卖' }).hasAttribute('disabled'),
    ).toBe(true),
  );
});
test('流水筛选含归档名称和北京时间日期，切换标签保留筛选', async () => {
  render(<Inventory />);
  await screen.findByText('真实茶饮');
  fireEvent.click(screen.getByRole('tab', { name: '库存流水' }));
  fireEvent.change(screen.getByLabelText('流水商品名称'), {
    target: { value: '归档商品' },
  });
  fireEvent.change(screen.getByLabelText('流水规格名称'), {
    target: { value: '大份' },
  });
  fireEvent.change(screen.getByLabelText('开始日期'), {
    target: { value: '2026-11-01' },
  });
  fireEvent.change(screen.getByLabelText('结束日期'), {
    target: { value: '2026-11-02' },
  });
  await select('流水类型', '手工调整');
  await waitFor(() => {
    const q = new URLSearchParams(api.mock.calls.at(-1)![0].split('?')[1]);
    expect(Object.fromEntries(q)).toMatchObject({
      productSearch: '归档商品',
      variantSearch: '大份',
      type: 'ADJUSTMENT',
      from: '2026-10-31T16:00:00.000Z',
      to: '2026-11-02T15:59:59.999Z',
    });
  });
  fireEvent.click(screen.getByRole('tab', { name: '库存管理' }));
  fireEvent.click(screen.getByRole('tab', { name: '库存流水' }));
  expect(screen.getByDisplayValue('2026-11-01')).toBeTruthy();
});
test('加载中、成功空结果以及归档预占提示', async () => {
  let resolve!: (value: unknown) => void;
  api.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const view = render(<Inventory />);
  expect(document.querySelector('.ant-spin-spinning')).toBeTruthy();
  resolve({
    items: [],
    total: 0,
    summary: { archivedReserved: 2, reserved: 2 },
  });
  expect(await screen.findByText('暂无库存数据')).toBeTruthy();
  expect(
    await screen.findByText(
      '已归档商品仍有 2 件被订单预占，请筛选“已归档”核对。',
    ),
  ).toBeTruthy();
  view.unmount();
});
