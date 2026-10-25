import type { Client } from './admin-types';
export class AdminRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function createClient(
  token: string,
  storeId?: string,
  signal?: AbortSignal,
): Client {
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
        signal,
      });
    } catch {
      throw new AdminRequestError(0, '网络连接失败，请检查网络后重试');
    }
    if (!response.ok) {
      let message =
        response.status === 401
          ? '后台访问凭据无效或已失效，请重新登录'
          : response.status === 403
            ? '你没有查看当前门店数据的权限，请联系管理员'
            : response.status >= 500
              ? '服务暂时不可用，请稍后重试'
              : '请求未能完成，请检查输入或刷新后重试';
      // Only known, public order messages may cross the error boundary.
      if (
        /^\/(orders|order-test)(\/|$)/.test(path) &&
        [403, 409].includes(response.status)
      ) {
        try {
          const payload = (await response.json()) as { message?: unknown };
          if (
            typeof payload.message === 'string' &&
            orderMessages.has(payload.message)
          )
            message = payload.message;
        } catch {
          /* Keep the safe fallback for empty/non-JSON responses. */
        }
      }
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

const orderMessages = new Set([
  '当前环境未开放模拟测试功能',
  '配送报价已失效，请重新获取报价',
  '结算预览已过期，请重新确认',
  '价格、费用或门店设置已变化，请重新结算',
  '门店资料或报价需要核对，暂不能结算',
  '当前订单暂不能接单，请调整商品或联系门店',
  '需确认补付配送费用',
  '当前订单不能重新询价，请先核对配送状态',
  '仅老板可终止制作中的异常订单',
  '当前订单状态不允许此操作，请刷新后重试',
  '订单已超时，请取消后重新下单',
  '商品、报价或利润保护条件已变化，不能继续此操作',
  '订单尚未超时',
  '订单金额超过支持范围，请分单',
]);
