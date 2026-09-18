import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { App } from './App';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
test('displays server-controlled test mode', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        environment: 'test',
        testMode: true,
        schemaVersion: 1,
      }),
    }),
  );
  render(<App />);
  expect(await screen.findByText('测试模式 · 不产生真实交易')).toBeTruthy();
  expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
    '商家管理后台',
  );
});
test('connection failure retries and shows live mode only after server response', async () => {
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        environment: 'production',
        testMode: false,
        schemaVersion: 1,
      }),
    });
  vi.stubGlobal('fetch', request);
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: '重新连接' }));
  expect(await screen.findByText('正式模式')).toBeTruthy();
  expect(request).toHaveBeenCalledTimes(2);
});
test('invalid runtime cannot enable test mode', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ testMode: 'false' }),
    }),
  );
  render(<App />);
  expect(await screen.findByRole('button', { name: '重新连接' })).toBeTruthy();
  expect(screen.queryByText('测试模式 · 不产生真实交易')).toBeNull();
});
