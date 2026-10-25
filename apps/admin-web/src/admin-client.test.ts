import { afterEach, expect, test, vi } from 'vitest';
import { createClient, AdminRequestError } from './admin-client';
afterEach(() => vi.unstubAllGlobals());

test('订单错误仅展示公开白名单，未知服务端内容不泄露', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: '配送报价已失效，请重新获取报价' }),
        { status: 409 },
      ),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Prisma secret details' }), {
        status: 409,
      }),
    );
  vi.stubGlobal('fetch', fetch);
  const api = createClient('test-only');
  await expect(api('/orders/preview')).rejects.toThrow(
    '配送报价已失效，请重新获取报价',
  );
  await expect(api('/orders/preview')).rejects.toThrow(
    '请求未能完成，请检查输入或刷新后重试',
  );
});
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
