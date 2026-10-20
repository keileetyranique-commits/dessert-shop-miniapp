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
vi.mock('./Data', () => ({ useCatalog: () => ({ api, products: [] }) }));
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
