import { afterEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CostSetup } from './CostSetup';
import { AdminRequestError } from '../admin-client';
const api = vi.fn();
let role = 'OWNER';
vi.mock('./Data', () => ({
  useCatalog: () => ({
    api,
    products: [
      {
        name: '测试商品',
        variantRecords: [
          { id: 'v', name: '标准' },
          { id: 'v2', name: '大份' },
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
  vi.unstubAllGlobals();
  api.mockReset();
  role = 'OWNER';
});

test.each(['recipe', 'packaging'])(
  '空清单 %s 必须确认，切换规格后必须重新确认',
  async (kind) => {
    api.mockResolvedValue([]);
    mount();
    fireEvent.click(
      screen.getByRole('tab', {
        name: kind === 'recipe' ? '商品配方' : '包装',
      }),
    );
    fireEvent.mouseDown(screen.getByLabelText('商品规格'));
    fireEvent.click(await screen.findByText('测试商品 / 标准'));
    if (kind === 'recipe') {
      fireEvent.change(screen.getByLabelText('此配方产出份数 · 必填'), {
        target: { value: '1' },
      });
      fireEvent.change(screen.getByLabelText('整批制作时长（秒）· 必填'), {
        target: { value: '0' },
      });
      fireEvent.change(
        screen.getByLabelText('整批其他可变成本（元）· 必填，没有请填 0'),
        { target: { value: '0' } },
      );
    } else {
      fireEvent.mouseDown(screen.getByLabelText('履约方式'));
      fireEvent.click(await screen.findByText('到店自取'));
    }
    const select = screen.getByLabelText('商品规格');
    const form = select.closest('form')!;
    fireEvent.submit(form);
    expect(
      await screen.findByText('清单为空，请添加项目或明确确认无需使用'),
    ).toBeTruthy();
    expect(api.mock.calls.some((c) => c[1] === 'PUT')).toBe(false);
    const checkbox = screen.getByRole('checkbox', {
      name:
        kind === 'recipe'
          ? '我确认此配方确实无需原料'
          : '我确认此商品在所选履约方式下确实无需包装',
    });
    fireEvent.click(checkbox);
    fireEvent.mouseDown(select);
    fireEvent.click(await screen.findByText('测试商品 / 大份'));
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    fireEvent.submit(form);
    await screen.findByText('清单为空，请添加项目或明确确认无需使用');
    expect(api.mock.calls.some((c) => c[1] === 'PUT')).toBe(false);
    fireEvent.click(checkbox);
    fireEvent.submit(form);
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        `/costs/variants/v2/${kind}`,
        'PUT',
        expect.objectContaining({
          items: [],
          [kind === 'recipe'
            ? 'noIngredientsConfirmed'
            : 'noPackagingConfirmed']: true,
        }),
      ),
    );
    await screen.findByText('已保存成本资料，请返回重新计算利润');
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  },
  20000,
);
function mount() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }));
  const style = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((e) => style(e));
  render(
    <MemoryRouter>
      <CostSetup />
    </MemoryRouter>,
  );
}
test('普通员工不能通过补资料入口读取成本', () => {
  role = 'MANAGER';
  mount();
  expect(screen.getByText('仅老板和成本负责人可维护成本资料')).toBeTruthy();
  expect(api).not.toHaveBeenCalled();
});
test('附加选项成本元转分、失败不报成功、零值显式保存', async () => {
  let fail = true;
  api.mockImplementation(async (path: string, method: string) => {
    if (method === 'PATCH') {
      if (fail) throw new AdminRequestError(500, '服务暂时不可用，请稍后重试');
      return {};
    }
    return path === '/costs/modifiers'
      ? [{ id: 'm', name: '附加项', costFen: null }]
      : [];
  });
  mount();
  fireEvent.click(screen.getByRole('tab', { name: '附加选项成本' }));
  fireEvent.mouseDown(screen.getByLabelText('附加选项'));
  fireEvent.click(await screen.findByText('附加项 · 未配置'));
  const input = screen.getByLabelText(
    '每次选择增加的成本（元）· 必填，没有请填 0',
  );
  fireEvent.change(input, { target: { value: '0.35' } });
  fireEvent.click(screen.getByRole('button', { name: '保存成本资料' }));
  expect(await screen.findByText('服务暂时不可用，请稍后重试')).toBeTruthy();
  expect(screen.queryByText('已保存成本资料，请返回重新计算利润')).toBeNull();
  expect(api).toHaveBeenCalledWith('/costs/modifiers/m', 'PATCH', {
    costFen: 35,
  });
  fail = false;
  fireEvent.change(input, { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: '保存成本资料' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/costs/modifiers/m', 'PATCH', {
      costFen: 0,
    }),
  );
  expect(
    await screen.findByText('已保存成本资料，请返回重新计算利润'),
  ).toBeTruthy();
});
