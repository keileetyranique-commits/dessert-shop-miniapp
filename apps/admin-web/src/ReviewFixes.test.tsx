import { afterEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { Workspace } from './StoreWorkspace';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function fixture(role: string) {
  const calls: {
    path: string;
    method: string;
    body: Record<string, unknown>;
  }[] = [];
  let archived = false;
  let modifierCost: number | null = null;
  const result = {
    ingredientCostFen: 100,
    packagingCostFen: 0,
    variableCostFen: 0,
    allocatedFixedCostFen: 0,
    fullUnitCostFen: 100,
    completeness: 'COMPLETE',
    missingInputs: [],
    calculationVersion: 'v1',
    calculatedAt: 'now',
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit) => {
      const method = init.method ?? 'GET';
      calls.push({
        path,
        method,
        body: init.body ? JSON.parse(String(init.body)) : {},
      });
      if (method === 'DELETE') archived = true;
      if (method === 'PATCH' && path.endsWith('/costs/modifiers/modifier'))
        modifierCost = JSON.parse(String(init.body)).costFen;
      const value = path.endsWith('/store')
        ? { id: 'store', name: '门店', address: '', businessHours: '' }
        : path.endsWith('/products')
          ? [
              {
                id: 'product',
                name: '商品',
                categoryId: 'category',
                description: '',
                imageUrl: '',
                status: 'ACTIVE',
                modifierGroupRecords: [],
                variantRecords: archived
                  ? []
                  : [
                      {
                        id: 'sku',
                        name: '规格',
                        salePriceFen: 1000,
                        stockQuantity: 1,
                        status: 'ACTIVE',
                      },
                    ],
              },
            ]
          : path.endsWith('/categories')
            ? [{ id: 'category', name: '分类', status: 'ACTIVE' }]
            : path.endsWith('/costs/modifiers')
              ? [{ id: 'modifier', name: '通用服务', costFen: modifierCost }]
              : path.includes('/cost?')
                ? result
                : path.endsWith('/cost/snapshots')
                  ? { ...result, snapshotId: 'saved' }
                  : path.includes('/fixed/') || path.includes('/allocation/')
                    ? null
                    : [];
      return new Response(JSON.stringify(value));
    }),
  );
  render(<Workspace token="test" storeId="store" role={role} />);
  return calls;
}
async function selectSku() {
  fireEvent.change(screen.getByLabelText('选择商品'), {
    target: { value: 'product' },
  });
  fireEvent.change(screen.getByLabelText('选择 规格'), {
    target: { value: 'sku' },
  });
}
test('cost manager can edit modifier cost but has no catalog write forms', async () => {
  const calls = fixture('COST_MANAGER');
  fireEvent.click(screen.getByRole('button', { name: '经营分析' }));
  fireEvent.click(screen.getByRole('button', { name: '选项成本' }));
  const field = await screen.findByLabelText('选项成本（元）');
  expect(screen.queryByRole('button', { name: '商品' })).toBeNull();
  expect(screen.queryByRole('button', { name: '库存' })).toBeNull();
  expect((field as HTMLInputElement).value).toBe('');
  fireEvent.submit(field.closest('form')!);
  expect(
    await screen.findByText('选项成本（元）：请输入最多两位小数的非负数'),
  ).toBeTruthy();
  expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  fireEvent.change(field, { target: { value: '0.35' } });
  fireEvent.submit(field.closest('form')!);
  await waitFor(() =>
    expect(
      calls.some(
        (c) =>
          c.method === 'PATCH' &&
          c.path.endsWith('/costs/modifiers/modifier') &&
          c.body.costFen === 35,
      ),
    ).toBe(true),
  );
});
test('clearing a configured modifier cost restores unconfigured without turning it into zero', async () => {
  fixture('COST_MANAGER');
  fireEvent.click(screen.getByRole('button', { name: '经营分析' }));
  fireEvent.click(screen.getByRole('button', { name: '选项成本' }));
  let field = await screen.findByLabelText('选项成本（元）');
  fireEvent.change(field, { target: { value: '0.35' } });
  fireEvent.submit(field.closest('form')!);
  await screen.findByRole('heading', { name: '通用服务 · ¥0.35' });
  fireEvent.click(
    screen.getByRole('button', { name: '清除成本 / 标记为未配置' }),
  );
  await screen.findByRole('heading', { name: '通用服务 · 未配置' });
  field = screen.getByLabelText('选项成本（元）');
  expect((field as HTMLInputElement).value).toBe('');
  fireEvent.change(field, { target: { value: '0' } });
  fireEvent.submit(field.closest('form')!);
  await screen.findByRole('heading', { name: '通用服务 · ¥0.00' });
});
test('preview is GET and snapshot save requires an explicit POST', async () => {
  const calls = fixture('OWNER');
  await waitFor(() =>
    expect(calls.some((c) => c.path.endsWith('/costs/modifiers'))).toBe(true),
  );
  fireEvent.click(screen.getByRole('button', { name: '经营分析' }));
  fireEvent.click(screen.getByRole('button', { name: '成本计算' }));
  await selectSku();
  fireEvent.click(screen.getByRole('button', { name: '计算当前单份成本' }));
  await screen.findByText(/预览（未保存快照）/);
  expect(calls.some((c) => c.method === 'POST')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: '保存成本快照' }));
  await screen.findByText(/已保存快照 saved/);
  expect(
    calls.filter(
      (c) => c.method === 'POST' && c.path.endsWith('/cost/snapshots'),
    ),
  ).toHaveLength(1);
});
test('SKU archival requires explicit confirmation and removes selection', async () => {
  const calls = fixture('MANAGER');
  await waitFor(() =>
    expect(calls.some((c) => c.path.endsWith('/products'))).toBe(true),
  );
  fireEvent.click(screen.getByRole('button', { name: '商品' }));
  fireEvent.click(screen.getByText('高级商品设置 · 多规格、选项与归档'));
  await selectSku();
  const confirm = screen.getByLabelText('确认归档当前 规格（历史资料保留）');
  fireEvent.submit(confirm.closest('form')!);
  expect(await screen.findByText('请先确认')).toBeTruthy();
  expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  fireEvent.click(confirm);
  fireEvent.submit(confirm.closest('form')!);
  await waitFor(() =>
    expect(
      calls.some(
        (c) => c.method === 'DELETE' && c.path.endsWith('/variants/sku'),
      ),
    ).toBe(true),
  );
  await waitFor(() =>
    expect(
      screen.queryByLabelText('确认归档当前 规格（历史资料保留）'),
    ).toBeNull(),
  );
});
