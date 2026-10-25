import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from '@testing-library/react';
import { OrderTestCenter } from './OrderTestCenter';
vi.setConfig({ testTimeout: 15000 });
const api = vi.fn();
vi.mock('./Data', () => ({ useCatalog: () => ({ api, canEdit: true }) }));
vi.mock('./Session', () => ({
  useSession: () => ({ identity: { role: 'MANAGER' }, storeId: 'store-a' }),
}));
beforeEach(() => {
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
  api.mockImplementation(async (path: string, method: string) => {
    if (path === '/orders/packaging') return [];
    if (path === '/orders/menu')
      return [
        {
          id: 'p',
          name: '真实饮品',
          variantRecords: [{ id: 'v', name: '标准', salePriceFen: 1880 }],
          modifierGroupRecords: [],
        },
      ];
    if (path === '/orders/settings')
      return {
        terms: {
          packagingRevenueFen: 0,
          customerDeliveryFeeFen: 0,
          deliverySubsidyFen: 0,
          merchantDiscountFen: 0,
          platformDiscountFen: 0,
        },
        autoAccept: false,
      };
    if (path.includes('?')) return { items: [] };
    if (path === '/orders/preview')
      return {
        previewId: 'preview',
        decision: 'PASS',
        message: '可继续结算',
        payableFen: 1880,
        goodsFen: 1880,
        merchantDiscountFen: 0,
        platformDiscountFen: 0,
        packagingRevenueFen: 0,
        customerDeliveryFeeFen: 0,
      };
    if (path === '/orders' && method === 'POST')
      return {
        id: 'order-123',
        orderStatus: 'PENDING_PAYMENT',
        payableFen: 1880,
      };
    if (path.endsWith('/actions'))
      return {
        id: 'order-123',
        orderStatus: 'AWAITING_ACCEPTANCE',
        payableFen: 1880,
      };
    throw Error('网络失败');
  });
});
afterEach(() => {
  cleanup();
  api.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
test('购物车只传真实规格数量，结算与创建用服务端预览，店长看不到老板设置', async () => {
  render(<OrderTestCenter />);
  fireEvent.mouseDown(
    await screen.findByRole('combobox', { name: '测试商品规格' }),
  );
  fireEvent.click(await screen.findByText('真实饮品 · 标准 · ¥18.80'));
  fireEvent.click(screen.getByRole('button', { name: '加入购物车' }));
  fireEvent.click(screen.getByRole('button', { name: '计算结算预览' }));
  await screen.findByText('可继续结算');
  expect(api).toHaveBeenCalledWith('/orders/preview', 'POST', {
    fulfillment: 'PICKUP',
    items: [{ variantId: 'v', quantity: 1, modifierIds: [] }],
  });
  fireEvent.click(screen.getByRole('button', { name: '提交测试订单' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/orders', 'POST', {
      previewId: 'preview',
      idempotencyKey: expect.any(String),
      acceptTopup: false,
    }),
  );
  expect(screen.queryByRole('tab', { name: '测试门店结算设置' })).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: '模拟付款' }));
  await screen.findByText('待接单');
  fireEvent.click(screen.getByRole('tab', { name: '故障与恢复' }));
  fireEvent.click(await screen.findByRole('button', { name: '重复付款事件' }));
  await screen.findByText(/重复付款事件已重放/);
  const calls = api.mock.calls.filter((c) => c[0].endsWith('/actions'));
  expect(calls.at(-1)![2].idempotencyKey).toBe(calls.at(-2)![2].idempotencyKey);
});

test('补差必须明确同意，应付金额同时显示补差且提交确认标志', async () => {
  const base = api.getMockImplementation()!;
  api.mockImplementation(async (...args) => {
    const result = await base(...args);
    return args[0] === '/orders/preview'
      ? {
          ...result,
          decision: 'TOPUP',
          requiredTopupFen: 600,
          message: '需确认补付配送费用',
        }
      : result;
  });
  render(<OrderTestCenter />);
  fireEvent.mouseDown(
    await screen.findByRole('combobox', { name: '测试商品规格' }),
  );
  fireEvent.click(await screen.findByText('真实饮品 · 标准 · ¥18.80'));
  fireEvent.click(screen.getByRole('button', { name: '加入购物车' }));
  fireEvent.click(screen.getByRole('button', { name: '计算结算预览' }));
  await screen.findByText('需确认补付配送费用');
  expect(
    (screen.getByRole('button', { name: '提交测试订单' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(
    screen.getByRole('checkbox', { name: /我同意额外补付配送费/ }),
  );
  await screen.findByRole('heading', { name: '应付 ¥24.80' });
  fireEvent.click(screen.getByRole('button', { name: '提交测试订单' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      '/orders',
      'POST',
      expect.objectContaining({ acceptTopup: true }),
    ),
  );
});
