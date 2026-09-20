import type { Client } from './admin-types';
export async function readResponse(response: Response): Promise<unknown> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw Error('网络连接中断，请刷新确认结果，不要重复提交');
  }
  let result: unknown;
  if (text.trim()) {
    try {
      result = JSON.parse(text);
    } catch {
      if (response.ok)
        throw Error('服务返回的数据不完整，请刷新确认结果，不要重复提交');
    }
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: '填写内容不正确，请检查后重试',
      401: '登录已失效，请重新登录',
      403: '没有操作权限，或门店已归档',
      404: '内容不存在或已归档，请刷新',
      409: '数据已变化，请刷新后重试',
      413: '图片太大，请选择不超过 5 MB 的图片',
    };
    const message =
      typeof result === 'object' && result !== null && 'message' in result
        ? result.message
        : undefined;
    throw Error(
      response.status >= 500
        ? '服务暂时不可用，请稍后重试'
        : typeof message === 'string' &&
            /^[\u3400-\u9fff，。；：、（）！？\s\d]+$/.test(message)
          ? message
          : (messages[response.status] ?? '操作失败，请稍后重试'),
    );
  }
  return result;
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
      throw Error('网络连接失败，请检查网络后重试');
    }
    return (await readResponse(response)) as T;
  };
}
