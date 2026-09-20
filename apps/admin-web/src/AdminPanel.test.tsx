import { afterEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { AdminPanel, CostResult } from './AdminPanel';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
test('login keeps credentials in memory and sends verified store selection on business calls', async () => {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, headers });
      const value = url.endsWith('/session')
        ? { id: 'manager', role: 'MANAGER', storeIds: ['store-a', 'store-b'] }
        : url.endsWith('/stores')
          ? [
              { id: 'store-a', name: '门店 A' },
              { id: 'store-b', name: '门店 B' },
            ]
          : url.endsWith('/store')
            ? {
                id: headers['X-Store-Id'],
                name: headers['X-Store-Id'] === 'store-a' ? '门店 A' : '门店 B',
                address: '地址',
                businessHours: '营业时间',
              }
            : [];
      return new Response(JSON.stringify(value));
    }),
  );
  render(<AdminPanel />);
  fireEvent.change(screen.getByLabelText('后台访问凭据'), {
    target: { value: 'session-token' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存登录' }));
  await screen.findByLabelText('当前授权门店');
  await waitFor(() =>
    expect(
      calls.some(
        (c) =>
          c.url.endsWith('/products') && c.headers['X-Store-Id'] === 'store-a',
      ),
    ).toBe(true),
  );
  fireEvent.change(screen.getByLabelText('当前授权门店'), {
    target: { value: 'store-b' },
  });
  await waitFor(() =>
    expect(
      calls.some(
        (c) =>
          c.url.endsWith('/products') && c.headers['X-Store-Id'] === 'store-b',
      ),
    ).toBe(true),
  );
  expect(calls.some((c) => c.url.includes('/costs/'))).toBe(false);
  expect(localStorage.getItem('token')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '退出' }));
  expect(screen.getByLabelText('后台访问凭据')).toBeTruthy();
});
test('failed login does not expose business UI', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ message: '后台访问凭据无效' }),
    }),
  );
  render(<AdminPanel />);
  fireEvent.change(screen.getByLabelText('后台访问凭据'), {
    target: { value: 'invalid' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存登录' }));
  expect(await screen.findByRole('alert')).toHaveProperty(
    'textContent',
    '后台访问凭据无效',
  );
  expect(screen.queryByLabelText('当前授权门店')).toBeNull();
});
test('partial cost is labelled with missing inputs and displays integer fen correctly', () => {
  render(
    <CostResult
      cost={{
        ingredientCostFen: 125,
        packagingCostFen: 0,
        variableCostFen: 0,
        allocatedFixedCostFen: 0,
        fullUnitCostFen: 125,
        completeness: 'PARTIAL',
        missingInputs: ['PACKAGING', 'PURCHASE_PRICE:0'],
        calculationVersion: 'v1',
        calculatedAt: 'now',
        snapshotId: 'snapshot',
      }}
    />,
  );
  expect(screen.getByText('资料不完整 · 仅计算已录入成本')).toBeTruthy();
  expect(screen.getByRole('alert').textContent).toContain('采购价');
  expect(screen.getAllByText('¥1.25')).toHaveLength(2);
});
