import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ImageEditor, ProductImage } from './Media';
import { uploadImage } from './media-client';
vi.mock('./media-client', async (original) => ({
  ...(await original<object>()),
  uploadImage: vi.fn(),
}));
const path = '/api/v1/admin/media/11111111-1111-4111-8111-111111111111';
const access = {
  token: 'test-only',
  storeId: 'store-a',
  canEdit: true,
  onExpired: vi.fn(),
};
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener() {},
    removeListener() {},
  }));
  URL.createObjectURL = vi.fn(() => 'blob:test-preview');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
test('受保护图片带鉴权读取 Blob，切店立即隐藏并释放旧图片', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      blob: async () => new Blob(['x'], { type: 'image/webp' }),
    })
    .mockImplementationOnce(() => new Promise(() => {}));
  vi.stubGlobal('fetch', fetcher);
  const view = render(
    <ProductImage image={path} title="测试图片" access={access} />,
  );
  expect(
    (await screen.findByRole('img', { name: '测试图片' })).getAttribute('src'),
  ).toBe('blob:test-preview');
  expect(fetcher.mock.calls[0]?.[1].headers).toEqual({
    Authorization: 'Bearer test-only',
    'X-Store-Id': 'store-a',
  });
  view.rerender(
    <ProductImage
      image={path}
      title="测试图片"
      access={{ ...access, storeId: 'store-b' }}
    />,
  );
  expect(screen.queryByRole('img', { name: '测试图片' })).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-preview');
  view.unmount();
  expect(fetcher.mock.calls[1]?.[1].signal.aborted).toBe(true);
});
test('公开图片仍可显示，加载失败用中文提示', async () => {
  render(
    <ProductImage
      image="https://example.com/image.jpg"
      title="商品照片"
      access={access}
    />,
  );
  const img = await screen.findByRole('img', { name: '商品照片' });
  fireEvent.error(img);
  expect(screen.getByText('图片读取失败')).toBeTruthy();
});
test('选图成功仅更新草稿；进度、移除和对象释放正常', async () => {
  let finish!: (value: string) => void;
  vi.mocked(uploadImage).mockImplementation((_file, _access, progress) => {
    progress(60);
    return {
      promise: new Promise<string>((resolve) => {
        finish = resolve;
      }),
      abort: vi.fn(),
    };
  });
  const change = vi.fn(),
    busy = vi.fn();
  const view = render(
    <ImageEditor
      image="https://example.com/old.png"
      access={access}
      disabled={false}
      onChange={change}
      onBusy={busy}
    />,
  );
  fireEvent.change(view.container.querySelector('input[type=file]')!, {
    target: { files: [new File(['png'], 'photo.png', { type: 'image/png' })] },
  });
  await screen.findByText('60%');
  expect(change).not.toHaveBeenCalled();
  finish(path);
  await waitFor(() => expect(change).toHaveBeenCalledWith(path));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-preview');
  fireEvent.click(screen.getByRole('button', { name: '移除图片' }));
  expect(change).toHaveBeenLastCalledWith('');
});
test('取消选图不上传，非法文件与上传失败不改变图片草稿', async () => {
  vi.mocked(uploadImage).mockReturnValue({
    promise: Promise.resolve(path),
    abort: vi.fn(),
  });
  const change = vi.fn();
  const view = render(
    <ImageEditor
      image=""
      access={access}
      disabled={false}
      onChange={change}
      onBusy={vi.fn()}
    />,
  );
  const input = view.container.querySelector('input[type=file]')!;
  fireEvent(input, new Event('cancel', { bubbles: true }));
  expect(uploadImage).not.toHaveBeenCalled();
  fireEvent.change(input, {
    target: {
      files: [new File(['svg'], 'bad.svg', { type: 'image/svg+xml' })],
    },
  });
  await screen.findByText('请选择 JPG、PNG 或 WebP 图片');
  expect(uploadImage).not.toHaveBeenCalled();
  vi.mocked(uploadImage).mockImplementation(() => ({
    promise: Promise.reject(Error('网络连接失败，图片未上传，请重试')),
    abort: vi.fn(),
  }));
  fireEvent.change(view.container.querySelector('input[type=file]')!, {
    target: { files: [new File(['png'], 'photo.png', { type: 'image/png' })] },
  });
  await screen.findByText('网络连接失败，图片未上传，请重试');
  expect(change).not.toHaveBeenCalled();
});
