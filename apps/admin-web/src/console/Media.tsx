import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Progress, Upload } from 'antd';
import { PictureOutlined, UploadOutlined } from '@ant-design/icons';
import {
  MEDIA_PATH,
  uploadImage,
  mediaError,
  type MediaAccess,
} from './media-client';
import { publicImage } from './catalog-adapter';
export function ProductImage({
  image,
  title,
  access,
}: {
  image: string;
  title: string;
  access: MediaAccess;
}) {
  const key = access.storeId + ':' + image;
  const [state, setState] = useState({ key: '', src: '', error: false });
  useEffect(() => {
    const abort = new AbortController();
    let url = '';
    setState({ key, src: '', error: false });
    if (MEDIA_PATH.test(image)) {
      fetch(image, {
        headers: {
          Authorization: 'Bearer ' + access.token,
          'X-Store-Id': access.storeId,
        },
        signal: abort.signal,
        cache: 'no-store',
      })
        .then(async (r) => {
          if (!r.ok) throw mediaError(r.status);
          const blob = await r.blob();
          if (blob.type !== 'image/webp' || !blob.size) throw Error();
          if (abort.signal.aborted) return;
          url = URL.createObjectURL(blob);
          setState({ key, src: url, error: false });
        })
        .catch(() => {
          if (!abort.signal.aborted) setState({ key, src: '', error: true });
        });
    } else setState({ key, src: publicImage(image), error: false });
    return () => {
      abort.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [key, image, access.token, access.storeId]);
  return (
    <div className="product-image">
      {state.key === key && state.src ? (
        <img
          src={state.src}
          alt={title}
          referrerPolicy="no-referrer"
          onError={() => setState({ key, src: '', error: true })}
        />
      ) : (
        <span>
          <PictureOutlined />
          <small>{state.error ? '图片读取失败' : '暂无图片'}</small>
        </span>
      )}
    </div>
  );
}
export function ImageEditor({
  image,
  onChange,
  onBusy,
  access,
  disabled,
}: {
  image: string;
  onChange: (v: string) => void;
  onBusy: (v: boolean) => void;
  access: MediaAccess;
  disabled: boolean;
}) {
  const [progress, setProgress] = useState<number | null>(null),
    [error, setError] = useState(''),
    [preview, setPreview] = useState('');
  const operation = useRef<{ abort: () => void } | null>(null);
  const active = useRef(true);
  const local = useRef('');
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      operation.current?.abort();
      if (local.current) URL.revokeObjectURL(local.current);
    };
  }, []);
  async function choose(file: File) {
    if (disabled || progress !== null || !access.canEdit) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      !/\.(jpe?g|png|webp)$/i.test(file.name)
    ) {
      setError('请选择 JPG、PNG 或 WebP 图片');
      return;
    }
    if (!file.size || file.size > 5 * 1024 * 1024) {
      setError('图片大小不能超过 5 MB');
      return;
    }
    setError('');
    setProgress(0);
    onBusy(true);
    local.current = URL.createObjectURL(file);
    setPreview(local.current);
    const task = uploadImage(file, access, (v) => {
      if (active.current) setProgress(v);
    });
    operation.current = task;
    try {
      const result = await task.promise;
      if (active.current) onChange(result);
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : '图片上传失败，请重试');
    } finally {
      if (local.current) URL.revokeObjectURL(local.current);
      local.current = '';
      if (active.current) {
        setPreview('');
        setProgress(null);
        onBusy(false);
      }
    }
  }
  return (
    <section className="image-editor" aria-label="商品图片">
      <div>
        {preview ? (
          <img className="upload-preview" src={preview} alt="待上传图片预览" />
        ) : (
          <ProductImage image={image} title="商品图片预览" access={access} />
        )}
      </div>
      <div>
        <Upload.Dragger
          accept=".jpg,.jpeg,.png,.webp"
          showUploadList={false}
          disabled={disabled || progress !== null}
          beforeUpload={(file) => {
            void choose(file);
            return false;
          }}
        >
          <UploadOutlined />
          <p>点击选择图片，或拖到这里</p>
          <small>JPG / PNG / WebP，最大 5 MB</small>
        </Upload.Dragger>
        {progress !== null && (
          <Progress percent={progress} aria-label="图片上传进度" />
        )}
        <Button
          type="text"
          danger
          disabled={disabled || progress !== null || !image}
          onClick={() => onChange('')}
        >
          移除图片
        </Button>
        <small className="muted">保存商品后生效</small>
        {error && <Alert type="error" title={error} />}
      </div>
    </section>
  );
}
