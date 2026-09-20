import { afterEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { AdminPanel } from './AdminPanel';
import { ProductManager } from './ProductManager';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
for (const empty of [false, true])
  test('创建门店刷新并自动进入新门店，空响应=' + empty, async () => {
    let created = false;
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (path: string, init: RequestInit) => {
        calls.push(path);
        if (path.endsWith('/stores') && init.method === 'POST') {
          created = true;
          expect(JSON.parse(String(init.body))).not.toHaveProperty('timezone');
          expect(JSON.parse(String(init.body))).not.toHaveProperty('status');
          return new Response(empty ? null : '{"id":"new"}', {
            status: empty ? 204 : 201,
          });
        }
        const store = {
          id: 'new',
          name: '新门店',
          address: '',
          businessHours: '',
          status: 'ACTIVE',
        };
        return new Response(
          JSON.stringify(
            path.endsWith('/session')
              ? { id: '老板', role: 'OWNER', storeIds: '*' }
              : path.endsWith('/stores')
                ? created
                  ? [store]
                  : []
                : path.endsWith('/store')
                  ? store
                  : path.includes('/fixed/') || path.includes('/allocation/')
                    ? null
                    : [],
          ),
        );
      }),
    );
    render(<AdminPanel />);
    fireEvent.change(screen.getByLabelText('后台访问凭据'), {
      target: { value: 'token' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存登录' }));
    fireEvent.click(await screen.findByText('创建门店'));
    fireEvent.change(screen.getByLabelText('门店名称'), {
      target: { value: '新门店' },
    });
    expect(screen.queryByLabelText('时区')).toBeNull();
    expect(screen.getByText('系统自动：北京时间；营业中')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '保存新门店' }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText('当前授权门店') as HTMLSelectElement).value,
      ).toBe('new'),
    );
    await waitFor(() =>
      expect(calls.some((p) => p.endsWith('/store'))).toBe(true),
    );
    expect(screen.queryByText(/Unexpected end/)).toBeNull();
  });
test('新商品只需名称分类售价，图片上传替代地址，自动创建默认规格', async () => {
  const api = vi.fn().mockResolvedValue({ id: 'p' });
  render(
    <ProductManager
      products={[]}
      categories={[{ id: 'category', name: '零售' }]}
      api={api}
      changed={() => {}}
      loading={false}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '新增商品' }));
  const dialog = within(await screen.findByRole('dialog'));
  fireEvent.change(dialog.getByLabelText('商品名称'), {
    target: { value: '商品' },
  });
  fireEvent.change(dialog.getByLabelText('售价（元）'), {
    target: { value: '18.80' },
  });
  expect(dialog.queryByLabelText('图片 URL')).toBeNull();
  expect(dialog.getByText(/系统自动：已上架/)).toBeTruthy();
  expect(dialog.getByText('选填 · 更多设置').closest('details')?.open).toBe(
    false,
  );
  fireEvent.click(dialog.getByRole('button', { name: '保存商品' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      '/products/simple',
      'POST',
      expect.objectContaining({
        salePriceFen: 1880,
        name: '商品',
        imageUrl: '',
      }),
    ),
  );
});

for (const [hasOther, refreshFails] of [
  [true, false],
  [false, false],
  [true, true],
] as const)
  test(
    '归档安全切换：其他门店=' + hasOther + '，刷新失败=' + refreshFails,
    async () => {
      let archived = false;
      const first = {
        id: 'first',
        name: '一店',
        status: 'ACTIVE',
        address: '',
        phone: '',
        businessHours: '',
      };
      const second = { ...first, id: 'second', name: '二店' };
      const fetcher = vi.fn(async (path: string, init: RequestInit) => {
        if (init.method === 'DELETE') {
          expect(JSON.parse(String(init.body))).toEqual({
            confirmationName: '一店',
          });
          expect((init.headers as Record<string, string>)['X-Store-Id']).toBe(
            'first',
          );
          archived = true;
          return new Response(null, { status: 204 });
        }
        if (archived && refreshFails && path.endsWith('/stores'))
          throw new Error('network failure');
        return new Response(
          JSON.stringify(
            path.endsWith('/session')
              ? { id: '老板', role: 'OWNER', storeIds: '*' }
              : path.endsWith('/stores')
                ? [...(archived ? [] : [first]), ...(hasOther ? [second] : [])]
                : path.endsWith('/store')
                  ? archived
                    ? second
                    : first
                  : path.includes('/fixed/') || path.includes('/allocation/')
                    ? null
                    : [],
          ),
        );
      });
      vi.stubGlobal('fetch', fetcher);
      render(<AdminPanel />);
      fireEvent.change(screen.getByLabelText('后台访问凭据'), {
        target: { value: 'token' },
      });
      fireEvent.click(screen.getByRole('button', { name: '保存登录' }));
      fireEvent.click(await screen.findByRole('button', { name: '门店设置' }));
      fireEvent.click(await screen.findByRole('button', { name: '归档门店' }));
      const dialog = within(await screen.findByRole('dialog'));
      expect(
        (dialog.getByRole('button', { name: '确认归档' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      fireEvent.change(dialog.getByLabelText('请输入门店名称“一店”确认'), {
        target: { value: '一店' },
      });
      fireEvent.click(dialog.getByRole('button', { name: '确认归档' }));
      await waitFor(() =>
        expect(
          (screen.getByLabelText('当前授权门店') as HTMLSelectElement).value,
        ).toBe(hasOther ? 'second' : ''),
      );
      expect(screen.queryByRole('option', { name: '一店' })).toBeNull();
      if (refreshFails)
        expect(
          await screen.findByText(
            '门店已归档，暂时无法刷新其他门店，请稍后重新登录确认',
          ),
        ).toBeTruthy();
      if (!hasOther)
        expect(screen.getByText('请选择门店，或先创建一家门店。')).toBeTruthy();
    },
  );
