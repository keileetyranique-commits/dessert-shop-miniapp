import { useEffect, useState } from 'react';
import { Upload, Button, Progress } from 'antd';
import { useMerchant } from './MerchantContext';
import { readResponse } from './admin-client';
export function ProductImage({ value }: { value: string }) {
  const { token, storeId } = useMerchant();
  const [src, setSrc] = useState('');
  useEffect(() => {
    setSrc('');
    if (!/^\/api\/v1\/admin\/media\/[0-9a-f-]{36}$/.test(value)) return;
    const controller = new AbortController();
    let objectUrl = '';
    fetch(value, {
      headers: { Authorization: 'Bearer ' + token, 'X-Store-Id': storeId },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const blob = await r.blob();
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob);
          setSrc(objectUrl);
        }
      })
      .catch(() => {});
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [value, token, storeId]);
  if (/^https?:\/\//.test(value))
    return (
      <img
        className="product-photo"
        src={value}
        alt="商品图片"
        referrerPolicy="no-referrer"
      />
    );
  return src ? (
    <img className="product-photo" src={src} alt="商品图片" />
  ) : (
    <span>暂无图片</span>
  );
}
export function ImageUpload({
  name,
  initial = '',
  onBusy,
}: {
  name: string;
  initial?: string;
  onBusy: (busy: boolean) => void;
}) {
  const { token, storeId } = useMerchant();
  const [value, setValue] = useState(initial),
    [error, setError] = useState(''),
    [progress, setProgress] = useState<number | null>(null);
  return (
    <div className="image-upload">
      <input type="hidden" name={name} value={value} />
      <ProductImage value={value} />
      <Upload.Dragger
        accept=".jpg,.jpeg,.png,.webp"
        maxCount={1}
        multiple={false}
        showUploadList={false}
        disabled={progress !== null}
        beforeUpload={(file) => {
          setError('');
          if (
            !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
            !/\.(jpe?g|png|webp)$/i.test(file.name)
          ) {
            setError('请选择 JPG、PNG 或 WebP 图片');
            return Upload.LIST_IGNORE;
          }
          if (!file.size || file.size > 5 * 1024 * 1024) {
            setError('请选择不超过 5 MB 的图片');
            return Upload.LIST_IGNORE;
          }
          return true;
        }}
        customRequest={(options) => {
          const xhr = new XMLHttpRequest();
          const form = new FormData();
          form.append('file', options.file as File);
          xhr.open('POST', '/api/v1/admin/media');
          xhr.setRequestHeader('Authorization', 'Bearer ' + token);
          xhr.setRequestHeader('X-Store-Id', storeId);
          setProgress(0);
          onBusy(true);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable)
              setProgress(Math.floor((e.loaded * 100) / e.total));
          };
          const failed = (message: string) => {
            setError(message);
            setProgress(null);
            onBusy(false);
            options.onError?.(new Error(message));
          };
          xhr.onerror = () => failed('网络连接失败，图片未上传，请重试');
          xhr.onabort = () => {
            setProgress(null);
            onBusy(false);
          };
          xhr.onload = async () => {
            try {
              const data = (await readResponse(
                new Response(xhr.responseText, { status: xhr.status }),
              )) as { imageUrl?: string };
              if (!data?.imageUrl) throw Error('上传结果不完整，请重试');
              setValue(data.imageUrl);
              setProgress(null);
              onBusy(false);
              options.onSuccess?.(data);
            } catch (err) {
              failed((err as Error).message);
            }
          };
          xhr.send(form);
          return { abort: () => xhr.abort() };
        }}
      >
        <p>{value ? '点击或拖拽更换图片' : '点击或拖拽上传商品图片'}</p>
        <p>支持 JPG、PNG、WebP，不超过 5 MB</p>
      </Upload.Dragger>
      {progress !== null && <Progress percent={progress} />}
      {value && (
        <Button disabled={progress !== null} onClick={() => setValue('')}>
          移除图片
        </Button>
      )}
      <p>移除后保存商品即可生效，不会删除历史经营资料。</p>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
