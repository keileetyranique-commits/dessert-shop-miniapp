import { afterEach, expect, test, vi } from 'vitest';
import { createClient } from './admin-client';
afterEach(() => vi.unstubAllGlobals());
test('空响应、JSON 和非 JSON 错误不会泄露解析异常', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const api = createClient('token', 'store');
  fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
  expect(await api('/store', 'DELETE')).toBeUndefined();
  fetch.mockResolvedValueOnce(new Response(''));
  expect(await api('/store', 'PATCH')).toBeUndefined();
  fetch.mockResolvedValueOnce(new Response('{"id":"new"}'));
  expect(await api('/stores', 'POST')).toEqual({ id: 'new' });
  for (const body of ['<html>Bad Gateway</html>', '{', '']) {
    fetch.mockResolvedValueOnce(new Response(body, { status: 502 }));
    await expect(api('/stores')).rejects.toThrow('服务暂时不可用');
  }
  fetch.mockResolvedValueOnce(new Response('not-json'));
  await expect(api('/stores')).rejects.toThrow('服务返回的数据不完整');
  fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  await expect(api('/stores')).rejects.toThrow('网络连接失败');
  fetch.mockResolvedValueOnce(
    new Response('{"message":"Unauthorized"}', { status: 401 }),
  );
  await expect(api('/stores')).rejects.toThrow('登录已失效');
});

test('响应读取中断也显示中文提示', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      text: () => Promise.reject(new Error('network error')),
    }),
  );
  await expect(createClient('token')('/stores')).rejects.toThrow(
    '网络连接中断',
  );
});
