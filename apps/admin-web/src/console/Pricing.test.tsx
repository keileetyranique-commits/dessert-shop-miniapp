import { afterEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Pricing } from './Pricing';
const api = vi.fn();
let role = 'OWNER';
vi.mock('./Data', () => ({
  useCatalog: () => ({
    api,
    products: [
      {
        id: 'p',
        name: '乌龙茶',
        variantRecords: [{ id: 'v', name: '默认规格', salePriceFen: 1880 }],
        modifierGroupRecords: [
          {
            id: 'g1',
            name: '可用组',
            status: 'ACTIVE',
            minSelections: 0,
            maxSelections: 1,
            modifierRecords: [
              {
                id: 'm1',
                name: '可用选项',
                status: 'ACTIVE',
                salePriceFen: 100,
              },
              {
                id: 'm2',
                name: '停用选项',
                status: 'INACTIVE',
                salePriceFen: 100,
              },
            ],
          },
          {
            id: 'g2',
            name: '停用组',
            status: 'INACTIVE',
            minSelections: 0,
            maxSelections: 1,
            modifierRecords: [
              {
                id: 'm3',
                name: '组内仍启用选项',
                status: 'ACTIVE',
                salePriceFen: 100,
              },
            ],
          },
        ],
      },
    ],
  }),
}));
vi.mock('./Session', () => ({
  useSession: () => ({ identity: { role }, storeId: 'store' }),
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  role = 'OWNER';
  api.mockReset();
});

test('定价附加选项同时过滤停用组与停用选项', async () => {
  api.mockImplementation(async (path: string) =>
    path === '/pricing/rules' ? null : [],
  );
  mount();
  await screen.findByText('如果这样卖');
  fireEvent.mouseDown(screen.getByLabelText('商品与规格'));
  fireEvent.click(await screen.findByText('乌龙茶 / 默认规格 · ¥18.80'));
  fireEvent.mouseDown(await screen.findByLabelText('附加选项 · 每份相同选择'));
  expect(await screen.findByText('可用组 / 可用选项 +¥1.00')).toBeTruthy();
  expect(screen.queryByText(/组内仍启用选项/)).toBeNull();
  expect(screen.queryByText(/可用组 \/ 停用选项/)).toBeNull();
});
function mount() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    })),
  });
  const style = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((e) => style(e));
  return render(
    <MemoryRouter>
      <Pricing />
    </MemoryRouter>,
  );
}
test('普通员工不可读取利润接口', () => {
  role = 'MANAGER';
  mount();
  expect(
    screen.getByText('仅老板和成本负责人可查看利润资料，请联系老板'),
  ).toBeTruthy();
  expect(api).not.toHaveBeenCalled();
});
test('成本和规则请求失败显示中文错误，不能误判盈利', async () => {
  api.mockRejectedValue(new Error('成本暂时无法读取'));
  mount();
  expect(await screen.findByText('成本暂时无法读取')).toBeTruthy();
  expect(screen.queryByText(/预计贡献利润 ¥/)).toBeNull();
});
test('真实规格可选择，精确传递模拟价，资料缺失不显示盈利', async () => {
  api.mockImplementation(async (path: string) => {
    if (path === '/pricing/rules') return null;
    if (path === '/costs/packaging') return [];
    return {
      calculationVersion: 'v1',
      calculatedAt: new Date().toISOString(),
      simulationId: 's',
      decision: 'MANUAL_REVIEW',
      requiredTopupFen: null,
      complete: false,
      missingInputs: ['乌龙茶：BOM'],
      blockedReasons: [],
      warnings: [],
      minimumSafeGoodsFen: null,
      activityMinimumGoodsFen: null,
      recommendedGoodsFen: null,
      current: {
        customerPaidFen: 1880,
        merchantRevenueFen: 1880,
        paymentFeeFen: 0,
        commissionFen: 0,
        deliveryCostFen: 0,
        merchantDeliveryBurdenFen: 0,
        variableCostFen: 0,
        allocatedFixedCostFen: 0,
      },
      ordinary: { customerPaidFen: 1880, merchantRevenueFen: 1880 },
    };
  });
  mount();
  await screen.findByText('如果这样卖');
  fireEvent.mouseDown(screen.getByLabelText('商品与规格'));
  fireEvent.click(await screen.findByText('乌龙茶 / 默认规格 · ¥18.80'));
  fireEvent.change(
    screen.getByLabelText('模拟单份售价 · 选填，留空沿用当前售价（元）'),
    { target: { value: '18.80' } },
  );
  fireEvent.click(screen.getByRole('button', { name: '计算利润与安全底价' }));
  expect(await screen.findByText('暂时无法确认是否盈利')).toBeTruthy();
  expect(screen.getByText('乌龙茶：商品配方')).toBeTruthy();
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      '/pricing/simulate',
      'POST',
      expect.objectContaining({
        month: expect.stringMatching(/^\d{4}-\d{2}$/),
        items: [
          { variantId: 'v', quantity: 1, modifierIds: [], salePriceFen: 1880 },
        ],
      }),
    ),
  );
  expect(
    api.mock.calls.some((c) => c[0].includes('/products') && c[1] !== 'GET'),
  ).toBe(false);
});
