import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MerchantRoutes } from './App';
import Products, { type Product } from './Products';
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
test('首页使用独立后台布局和八个导航，不请求或伪造经营数据', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  render(
    <MemoryRouter initialEntries={['/admin/dashboard']}>
      <MerchantRoutes />
    </MemoryRouter>,
  );
  const nav = within(screen.getByRole('navigation', { name: '商家后台导航' }));
  for (const label of [
    '首页',
    '商品',
    '订单',
    '库存',
    '营销',
    '配送',
    '经营分析',
    '门店设置',
  ])
    expect(nav.getByRole('link', { name: label })).toBeTruthy();
  expect(screen.getAllByText('—')).toHaveLength(4);
  expect(screen.getByText('本周营收（元）')).toBeTruthy();
  expect(screen.getByRole('heading', { name: '待办事项' })).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(nav.getByRole('link', { name: '订单' }));
  expect(screen.getByText('该功能将在后续阶段接入')).toBeTruthy();
});
test('商品页空状态、分类筛选及新增弹窗不会执行保存请求', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  render(<Products />);
  expect(screen.getByText('暂无商品数据')).toBeTruthy();
  expect(screen.getByLabelText('分类筛选')).toBeTruthy();
  for (const label of ['图片', '商品', '分类', '售价', '状态', '操作'])
    expect(screen.getByRole('columnheader', { name: label })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '新增商品' }));
  const dialog = within(screen.getByRole('dialog', { name: '新增商品' }));
  fireEvent.change(dialog.getByLabelText('售价（元）'), {
    target: { value: '18.80' },
  });
  expect(
    (
      dialog.getByRole('button', {
        name: '保存（后续接入）',
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(dialog.getByText('选填 · 更多设置').closest('details')?.open).toBe(
    false,
  );
  fireEvent.click(dialog.getByRole('button', { name: '关闭编辑窗口' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
test('迁移的搜索、分类过滤、状态和编辑弹窗支持真实数据形状', () => {
  // Fixtures are test-only; runtime does not ship example business rows.
  const rows: Product[] = [
    {
      id: 'p',
      category_id: 'c',
      title: '测试商品',
      description: '',
      image: '',
      available: true,
      priceFen: 1880,
    },
  ];
  render(
    <Products
      rows={rows}
      categories={[
        { id: 'c', name: '测试分类' },
        { id: 'other', name: '其他' },
      ]}
    />,
  );
  expect(screen.getByText('¥18.80')).toBeTruthy();
  expect(screen.getByText('已上架')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('分类筛选'), {
    target: { value: 'other' },
  });
  expect(screen.queryByText('测试商品')).toBeNull();
  fireEvent.change(screen.getByLabelText('分类筛选'), {
    target: { value: '' },
  });
  fireEvent.change(screen.getByLabelText('搜索商品'), {
    target: { value: '不匹配' },
  });
  expect(screen.getByText('没有找到匹配的商品')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '清除' }));
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  expect(
    (
      within(screen.getByRole('dialog', { name: '编辑商品' })).getByLabelText(
        '售价（元）',
      ) as HTMLInputElement
    ).value,
  ).toBe('18.80');
});
test('商品加载和失败都有明确状态，错误不伪装为空列表', () => {
  const view = render(<Products loading />);
  expect(screen.getByText('商品加载中…')).toBeTruthy();
  view.rerender(<Products error />);
  expect(screen.getByText('商品暂时无法加载，请稍后重试')).toBeTruthy();
  expect(screen.queryByText('暂无商品数据')).toBeNull();
});
