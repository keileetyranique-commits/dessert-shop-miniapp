import type { Client } from './admin-types';
export function createClient(token: string, storeId?: string): Client {
  return async <T>(
    path: string,
    method = 'GET',
    body?: unknown,
  ): Promise<T> => {
    const response = await fetch('/api/v1/admin' + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        ...(storeId ? { 'X-Store-Id': storeId } : {}),
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        typeof result.message === 'string'
          ? result.message
          : '请求失败，请重新登录或刷新',
      );
    return result as T;
  };
}
