import { useEffect, useRef, useState } from 'react';
import { AdminRequestError } from '../admin-client';
import { publicImage } from './catalog-adapter';
import {
  MEDIA_PATH,
  mediaError,
  saveProductImage,
  uploadImage,
  type MediaAccess,
} from './media-client';
export function ProductImage({
  image,
  title,
  access,
  large = false,
}: {
  image: string;
  title: string;
  access?: MediaAccess;
  large?: boolean;
}) {
  const identity = (access?.storeId ?? '') + ':' + image;
  const [loaded, setLoaded] = useState({ identity: '', src: '', error: '' });
  const expired = useRef(access?.onExpired);
  expired.current = access?.onExpired;
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    setLoaded({ identity, src: '', error: '' });
    if (MEDIA_PATH.test(image) && access) {
      fetch(image, {
        headers: {
          Authorization: 'Bearer ' + access.token,
          'X-Store-Id': access.storeId,
        },
        cache: 'no-store',
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw mediaError(response.status);
          const blob = await response.blob();
          if (blob.type !== 'image/webp' || !blob.size) throw new Error();
          if (controller.signal.aborted) return;
          objectUrl = URL.createObjectURL(blob);
          setLoaded({ identity, src: objectUrl, error: '' });
        })
        .catch((error) => {
          if (controller.signal.aborted) return;
          if (error instanceof AdminRequestError && error.status === 401)
            expired.current?.();
          setLoaded({
            identity,
            src: '',
            error:
              error instanceof AdminRequestError
                ? error.message
                : '图片读取失败，请稍后重试',
          });
        });
    } else {
      setLoaded({ identity, src: image ? publicImage(image) : '', error: '' });
    }
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image, identity, access?.token, access?.storeId]);
  const state = loaded.identity === identity ? loaded : { src: '', error: '' };
  return (
    <div className={large ? 'space-y-2' : ''}>
      {state.src ? (
        <img
          src={state.src}
          alt={title}
          referrerPolicy="no-referrer"
          onError={() =>
            setLoaded({
              identity,
              src: '',
              error: '图片读取失败，请更换图片或稍后重试',
            })
          }
          className={
            large
              ? 'w-32 h-32 rounded object-cover'
              : 'w-12 h-12 rounded object-cover'
          }
        />
      ) : (
        <div
          className={`${large ? 'w-32 h-32' : 'w-12 h-12'} rounded bg-[#F5F5F5] text-xs text-[#6B7280] flex items-center justify-center`}
        >
          {image && MEDIA_PATH.test(image) && !state.error
            ? '图片加载中…'
            : '暂无图片'}
        </div>
      )}
      {state.error && (
        <p className="text-xs text-red-700 max-w-48">{state.error}</p>
      )}
    </div>
  );
}
export function ImageEditor({
  id,
  initial,
  access,
  onSaved,
  onDraft,
  onBusy,
  disabled = false,
}: {
  id?: string;
  initial: string;
  access: MediaAccess;
  onSaved: (image: string) => void;
  onDraft?: (image: string) => void;
  onBusy?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const [image, setImage] = useState(initial),
    [saved, setSaved] = useState(initial),
    [local, setLocal] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [progress, setProgress] = useState<number | null>(null),
    [saving, setSaving] = useState(false);
  const task = useRef<{ abort: () => void } | null>(null);
  const save = useRef<AbortController | null>(null);
  const active = useRef(true);
  const localUrl = useRef('');
  function clearLocal() {
    if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    localUrl.current = '';
    setLocal('');
  }
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      task.current?.abort();
      save.current?.abort();
      if (localUrl.current) URL.revokeObjectURL(localUrl.current);
    };
  }, []);
  function fail(e: unknown) {
    if (e instanceof AdminRequestError && e.status === 401) access.onExpired();
    else setError(e instanceof Error ? e.message : '图片操作失败，请稍后重试');
  }
  async function choose(file?: File) {
    if (!file || !access.canEdit || disabled || progress !== null || saving)
      return;
    setError('');
    setNotice('');
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      !/\.(jpe?g|png|webp)$/i.test(file.name)
    ) {
      setError('请选择 JPG、JPEG、PNG 或 WebP 图片');
      return;
    }
    if (!file.size || file.size > 5 * 1024 * 1024) {
      setError('请选择不超过 5 MB 的图片');
      return;
    }
    clearLocal();
    localUrl.current = URL.createObjectURL(file);
    setLocal(localUrl.current);
    setProgress(0);
    onBusy?.(true);
    const operation = uploadImage(file, access, (value) => {
      if (active.current) setProgress(value);
    });
    task.current = operation;
    try {
      const result = await operation.promise;
      if (active.current) {
        setImage(result);
        onDraft?.(result);
        setNotice(
          id
            ? '上传成功，点击“保存图片”或“保存商品”后生效'
            : '上传成功，保存商品后生效',
        );
      }
    } catch (e) {
      if (active.current) fail(e);
    } finally {
      if (active.current) {
        setProgress(null);
        onBusy?.(false);
        clearLocal();
        task.current = null;
      }
    }
  }
  async function persist() {
    if (
      !id ||
      !access.canEdit ||
      disabled ||
      progress !== null ||
      saving ||
      image === saved
    )
      return;
    setSaving(true);
    onBusy?.(true);
    setError('');
    setNotice('');
    const controller = new AbortController();
    save.current = controller;
    try {
      await saveProductImage(id, image, access, controller.signal);
      if (active.current) {
        setSaved(image);
        onSaved(image);
        setNotice(image ? '商品图片已保存' : '商品图片已移除');
      }
    } catch (e) {
      if (active.current) fail(e);
    } finally {
      if (active.current) {
        setSaving(false);
        onBusy?.(false);
      }
    }
  }
  return (
    <section className="mb-4 space-y-3" aria-label="商品图片">
      <p className="text-sm font-medium">商品图片</p>
      {local ? (
        <img
          src={local}
          alt="待上传图片预览"
          className="w-32 h-32 rounded object-cover"
        />
      ) : (
        <ProductImage
          image={image}
          title="当前商品图片"
          access={access}
          large
        />
      )}
      {access.canEdit ? (
        <>
          <label className="inline-block border border-[#E5E5E5] rounded px-3 py-2 text-sm text-primary cursor-pointer">
            选择图片
            <input
              aria-label="选择图片"
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              disabled={disabled || progress !== null || saving}
              className="sr-only"
              onChange={(e) => {
                void choose(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <p className="text-xs text-[#6B7280]">
            支持 JPG、JPEG、PNG、WebP，最大 5 MB
          </p>
          {progress !== null && (
            <div role="status">
              <progress
                aria-label="图片上传进度"
                max={100}
                value={progress}
                className="w-full"
              />
              {progress}% {progress === 100 ? '正在处理图片…' : '上传中…'}
            </div>
          )}
          <div className="flex gap-3">
            {id && (
              <button
                disabled={
                  disabled || progress !== null || saving || image === saved
                }
                onClick={() => void persist()}
                className="bg-primary text-white px-3 py-2 rounded text-sm disabled:opacity-50"
              >
                {saving ? '保存中…' : '保存图片'}
              </button>
            )}
            <button
              disabled={disabled || progress !== null || saving || !image}
              onClick={() => {
                clearLocal();
                setImage('');
                onDraft?.('');
                setError('');
                setNotice('待移除，保存后生效');
              }}
              className="text-sm text-[#6B7280] disabled:opacity-50"
            >
              移除图片
            </button>
          </div>
          <p className="text-xs text-[#6B7280]">
            {id
              ? '“保存图片”仅修改图片；“保存商品”保存本次商品资料。'
              : '图片将随新增商品一起保存。'}
          </p>
        </>
      ) : (
        <p className="text-sm text-[#6B7280]">当前账号仅可查看图片</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      )}
    </section>
  );
}
