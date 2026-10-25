import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { SoundPanel } from './Terminal';

const api = vi.fn();
const start = vi.fn(),
  close = vi.fn();
vi.mock('../../admin-web/src/console/Data', () => ({
  useCatalog: () => ({ api, canEdit: true }),
}));
vi.mock('../../admin-web/src/console/Session', () => ({
  useSession: () => ({ identity: { id: 'operator' }, storeId: 'store' }),
}));
beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  api.mockResolvedValue({ items: [] });
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener() {},
    removeListener() {},
  }));
  vi.stubGlobal(
    'AudioContext',
    class {
      currentTime = 0;
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      close = close;
      createGain = () => ({
        gain: { value: 0 },
        connect() {},
        disconnect() {},
      });
      createOscillator = () => ({
        frequency: { value: 0 },
        connect() {},
        start,
        stop() {},
      });
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test('需主动开启声音；新单去重、静音、断线重连和卸载释放音频', async () => {
  const view = render(<SoundPanel />);
  await waitFor(() => expect(api).toHaveBeenCalled());
  expect(start).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: '开启接单声音' }));
  await screen.findByRole('button', { name: '试听 / 重新开启声音' });
  expect(start).toHaveBeenCalledTimes(1);
  api.mockResolvedValue({
    items: [{ id: 'one', orderStatus: 'AWAITING_ACCEPTANCE' }],
  });
  await act(async () => {
    window.dispatchEvent(new Event('online'));
  });
  await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
  await act(async () => {
    window.dispatchEvent(new Event('online'));
  });
  expect(start).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole('switch'));
  api.mockResolvedValue({ items: [{ id: 'two', orderStatus: 'PREPARING' }] });
  await act(async () => {
    window.dispatchEvent(new Event('online'));
  });
  expect(start).toHaveBeenCalledTimes(2);
  api.mockRejectedValue(new Error('offline'));
  await act(async () => {
    window.dispatchEvent(new Event('online'));
  });
  await screen.findByText(/连接中断/);
  api.mockResolvedValue({ items: [] });
  await act(async () => {
    window.dispatchEvent(new Event('online'));
  });
  await waitFor(() => expect(screen.queryByText(/连接中断/)).toBeNull());
  view.unmount();
  expect(close).toHaveBeenCalledOnce();
});
