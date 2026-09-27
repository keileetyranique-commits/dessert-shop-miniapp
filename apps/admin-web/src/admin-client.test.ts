import { afterEach, expect, test, vi } from 'vitest';
import { createClient, AdminRequestError } from './admin-client';
afterEach(() => vi.unstubAllGlobals());
test('空响应安全处理，非 JSON 和网络错误不泄露原始信息', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(
      new Response('<html>Server error</html>', { status: 500 }),
    )
    .mockRejectedValueOnce(new Error('network details'));
  vi.stubGlobal('fetch', fetch);
  const api = createClient('test-only');
  expect(await api('/session')).toBeUndefined();
  await expect(api('/session')).rejects.toThrow('服务暂时不可用，请稍后重试');
  await expect(api('/session')).rejects.toThrow(
    '网络连接失败，请检查网络后重试',
  );
});
test.each([401, 403])('权限错误保留状态且显示中文 %s', async (status) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('Unauthorized', { status })),
  );
  await expect(createClient('test-only')('/session')).rejects.toBeInstanceOf(
    AdminRequestError,
  );
  await expect(createClient('test-only')('/session')).rejects.toMatchObject({
    status,
  });
});
