import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Orders } from './Orders';
vi.setConfig({ testTimeout: 15000 });
const api = vi.fn();
let role = 'MANAGER';
vi.mock('./Data', () => ({ useCatalog: () => ({ api, canEdit: true }) }));
vi.mock('./Session', () => ({
  useSession: () => ({ storeId: 'store-a', identity: { role } }),
}));
beforeEach(() => {
  role = 'MANAGER';
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
    path.startsWith('/orders?')
      ? {
          items: [
            {
              id: 'order-12345678',
              orderStatus: 'AWAITING_ACCEPTANCE',
              paymentStatus: 'PAID',
              fulfillmentStatus: 'NOT_STARTED',
              mode: 'PICKUP',
              payableFen: 1880,
              snapshot: {
                lines: [
                  {
                    productName: '真实商品',
                    variantName: '标准',
                    quantity: 1,
                    modifiers: [],
                  },
                ],
              },
              createdAt: '2026-10-25T00:00:00Z',
              testMode: true,
            },
          ],
          total: 1,
        }
      : {},
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  api.mockReset();
});
test('真实订单列表显示中文状态、元金额和测试标记，接单后刷新', async () => {
  render(<Orders />);
  expect(await screen.findByText('真实商品 × 1')).toBeTruthy();
  expect(screen.getByText('¥18.80')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '接单制作' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      '/orders/order-12345678/actions',
      'POST',
      expect.objectContaining({
        action: 'ACCEPT',
        idempotencyKey: expect.any(String),
      }),
    ),
  );
  expect(screen.getByText(/不计入真实营业额/)).toBeTruthy();
});
test('网络失败保留明确错误，不伪装空列表', async () => {
  api.mockRejectedValue(new Error('网络连接失败，请检查网络后重试'));
  render(<Orders />);
  expect(
    await screen.findByText('网络连接失败，请检查网络后重试'),
  ).toBeTruthy();
});

test.each([
  ['OWNER', 'RENEW_QUOTE'],
  ['OWNER', 'RECOVER_CANCEL'],
  ['MANAGER', 'NONE'],
])(
  '异常恢复只允许老板，且确认前不发送敏感请求：%s %s',
  async (value, action) => {
    role = value;
    const base = api.getMockImplementation()!;
    api.mockImplementation(async (path: string) => {
      const result = await base(path);
      if (result.items)
        Object.assign(result.items[0], {
          orderStatus: 'READY',
          mode: 'DELIVERY',
          fulfillmentStatus: 'READY',
          issue: '配送报价已到期，请老板重新询价；成交金额保持不变',
        });
      return result;
    });
    render(<Orders />);
    await screen.findByText('真实商品 × 1');
    if (value === 'MANAGER') {
      expect(screen.queryByRole('button', { name: '重新询价' })).toBeNull();
      expect(
        screen.queryByRole('button', { name: '异常终止并模拟退款' }),
      ).toBeNull();
      return;
    }
    if (action === 'RENEW_QUOTE') {
      fireEvent.click(screen.getByRole('button', { name: '重新询价' }));
      await screen.findByText(/不会降低已上涨的报价/);
      expect(api.mock.calls.some((c) => c[1] === 'POST')).toBe(false);
      fireEvent.click(screen.getByRole('button', { name: '确认操作' }));
      await waitFor(() =>
        expect(api).toHaveBeenCalledWith(
          '/orders/order-12345678/requote',
          'POST',
          { idempotencyKey: expect.any(String) },
        ),
      );
      await waitFor(() =>
        expect(screen.queryByRole('button', { name: '确认操作' })).toBeNull(),
      );
      return;
    }
    fireEvent.click(screen.getByRole('button', { name: '异常终止并模拟退款' }));
    await screen.findByText(/会关闭测试订单、释放预占库存/);
    expect(api.mock.calls.some((c) => c[1] === 'POST')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '确认操作' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/orders/order-12345678/actions',
        'POST',
        { action: 'RECOVER_CANCEL', idempotencyKey: expect.any(String) },
      ),
    );
  },
);
