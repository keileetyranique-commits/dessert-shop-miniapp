import { afterEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { StoreSettings } from './StoreSettings';
const api = vi.fn();
const updateStore = vi.fn();
let role = 'OWNER';
vi.mock('./Data', () => ({ useCatalog: () => ({ api }) }));
vi.mock('./Session', () => ({
  useSession: () => ({ identity: { role }, updateStore }),
}));
const store = {
  id: 's',
  name: '真实门店',
  address: '旧地址',
  contactPhone: '123',
  businessHours: '每天营业',
  timezone: 'Asia/Shanghai',
  status: 'ACTIVE',
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  api.mockReset();
  updateStore.mockReset();
  role = 'OWNER';
});
function setup() {
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
  api.mockImplementation(async (_path, method, body) =>
    method === 'PATCH' ? { ...store, ...body } : store,
  );
}
test('老板读取真实资料，保存允许字段并同步门店名称', async () => {
  setup();
  render(<StoreSettings />);
  await screen.findByDisplayValue('真实门店');
  fireEvent.change(screen.getByLabelText('门店名称（必填）'), {
    target: { value: '新店名' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存门店资料' }));
  await screen.findByText('门店资料已保存');
  expect(api).toHaveBeenCalledWith('/store', 'PATCH', {
    name: '新店名',
    address: '旧地址',
    contactPhone: '123',
    businessHours: '每天营业',
  });
  expect(updateStore).toHaveBeenCalledWith(
    expect.objectContaining({ name: '新店名' }),
  );
});
test('保存失败保留内容、不误报成功；只读角色不显示保存', async () => {
  setup();
  api.mockImplementation(async (_path, method) => {
    if (method === 'PATCH') throw Error('网络失败');
    return store;
  });
  const view = render(<StoreSettings />);
  await screen.findByDisplayValue('真实门店');
  fireEvent.change(screen.getByLabelText('门店名称（必填）'), {
    target: { value: '待保存名称' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存门店资料' }));
  await screen.findByText('网络失败');
  expect(screen.getByDisplayValue('待保存名称')).toBeTruthy();
  expect(screen.queryByText('门店资料已保存')).toBeNull();
  expect(updateStore).not.toHaveBeenCalled();
  view.unmount();
  role = 'MANAGER';
  render(<StoreSettings />);
  await screen.findByDisplayValue('真实门店');
  expect(screen.queryByRole('button', { name: '保存门店资料' })).toBeNull();
});
test('加载错误可重试，空名称不发送写请求', async () => {
  setup();
  api.mockRejectedValueOnce(Error('加载失败'));
  render(<StoreSettings />);
  await screen.findByText('加载失败');
  fireEvent.click(screen.getByRole('button', { name: '重新加载' }));
  await screen.findByDisplayValue('真实门店');
  fireEvent.change(screen.getByLabelText('门店名称（必填）'), {
    target: { value: '  ' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存门店资料' }));
  await waitFor(() => expect(screen.getByText('请输入门店名称')).toBeTruthy());
  expect(api.mock.calls.some((c) => c[1] === 'PATCH')).toBe(false);
});
