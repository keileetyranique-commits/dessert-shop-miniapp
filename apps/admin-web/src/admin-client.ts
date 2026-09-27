import type { Client } from './admin-types';
export class AdminRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function createClient(token: string, storeId?: string): Client {
  return async <T>(
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<T> => {
    let response: Response;
    try {
      response = await fetch('/api/v1/admin' + path, {
        method,
        headers: {
          Authorization: 'Bearer ' + token,
          ...(storeId ? { 'X-Store-Id': storeId } : {}),
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
      });
    } catch {
      throw new AdminRequestError(0, '网络连接失败，请检查网络后重试');
    }
    if (!response.ok) {
      const message =
        response.status === 401
          ? '后台访问凭据无效或已失效，请重新登录'
          : response.status === 403
            ? '你没有查看当前门店数据的权限，请联系管理员'
            : response.status >= 500
              ? '服务暂时不可用，请稍后重试'
              : '请求未能完成，请检查输入或刷新后重试';
      throw new AdminRequestError(response.status, message);
    }
    try {
      const text = await response.text();
      return (text.trim() ? JSON.parse(text) : undefined) as T;
    } catch {
      throw new AdminRequestError(
        response.status,
        '服务返回的数据暂时无法读取，请稍后重试',
      );
    }
  };
}
