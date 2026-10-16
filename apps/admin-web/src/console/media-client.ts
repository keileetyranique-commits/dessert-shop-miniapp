import { AdminRequestError } from '../admin-client';
export const MEDIA_PATH =
  /^\/api\/v1\/admin\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export interface MediaAccess {
  token: string;
  storeId: string;
  canEdit: boolean;
  onExpired: () => void;
}
export function mediaError(status: number): AdminRequestError {
  const message =
    status === 401
      ? '登录已失效，请重新登录'
      : status === 403
        ? '没有当前门店的图片操作权限，请联系管理员'
        : status === 404
          ? '商品或图片不存在，或不属于当前门店，请刷新后重试'
          : status === 413
            ? '请选择不超过 5 MB 的图片'
            : status === 400
              ? '图片格式不符、文件损坏或不是有效静态图片，请更换图片'
              : '图片操作失败，请稍后重试';
  return new AdminRequestError(status, message);
}
export function uploadImage(
  file: File,
  access: MediaAccess,
  onProgress: (value: number) => void,
) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<string>((resolve, reject) => {
    xhr.open('POST', '/api/v1/admin/media');
    xhr.setRequestHeader('Authorization', 'Bearer ' + access.token);
    xhr.setRequestHeader('X-Store-Id', access.storeId);
    xhr.timeout = 60000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.floor((e.loaded * 100) / e.total));
    };
    xhr.onerror = () => reject(new Error('网络连接失败，图片未上传，请重试'));
    xhr.ontimeout = () => reject(new Error('图片上传超时，请重试'));
    xhr.onabort = () => reject(new Error('图片上传已取消'));
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(mediaError(xhr.status));
        return;
      }
      try {
        const data = JSON.parse(xhr.responseText) as { imageUrl?: string };
        if (!data.imageUrl || !MEDIA_PATH.test(data.imageUrl))
          throw new Error();
        resolve(data.imageUrl);
      } catch {
        reject(new Error('上传结果暂时无法读取，请重试'));
      }
    };
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}
export async function saveProductImage(
  id: string,
  imageUrl: string,
  access: MediaAccess,
  signal: AbortSignal,
) {
  let response: Response;
  try {
    response = await fetch('/api/v1/admin/products/' + encodeURIComponent(id), {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer ' + access.token,
        'X-Store-Id': access.storeId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageUrl }),
      cache: 'no-store',
      signal,
    });
  } catch {
    throw new Error('网络连接失败，请刷新确认图片后重试');
  }
  if (!response.ok) throw mediaError(response.status);
  // No JSON parsing required: a successful empty response is also valid.
}
