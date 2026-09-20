import { afterEach, expect, test, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ImageUpload } from './ImageUpload';
import { MerchantContext } from './MerchantContext';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
test('上传前拦截类型和大小错误，不发送文件', async () => {
  const xhr = vi.fn();
  vi.stubGlobal('XMLHttpRequest', xhr);
  const { container } = render(
    <ImageUpload name="imageUrl" onBusy={() => {}} />,
  );
  const input = container.querySelector('input[type=file]')!;
  fireEvent.change(input, {
    target: {
      files: [new File(['bad'], 'danger.svg', { type: 'image/svg+xml' })],
    },
  });
  expect(await screen.findByText('请选择 JPG、PNG 或 WebP 图片')).toBeTruthy();
  fireEvent.change(container.querySelector('input[type=file]')!, {
    target: {
      files: [
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', {
          type: 'image/png',
        }),
      ],
    },
  });
  expect(await screen.findByText('请选择不超过 5 MB 的图片')).toBeTruthy();
  expect(xhr).not.toHaveBeenCalled();
});
test('上传携带本店权限，显示进度与预览，可更换和移除', async () => {
  class UploadRequest {
    static last: UploadRequest;
    constructor() {
      UploadRequest.last = this;
    }
    headers: Record<string, string> = {};
    upload = {
      onprogress: null as
        | null
        | ((e: {
            lengthComputable: boolean;
            loaded: number;
            total: number;
          }) => void),
    };
    open = vi.fn();
    send = vi.fn();
    abort = vi.fn();
    setRequestHeader(key: string, value: string) {
      this.headers[key] = value;
    }
    status = 201;
    responseText = '';
    onload: (() => Promise<void>) | null = null;
  }
  vi.stubGlobal('XMLHttpRequest', UploadRequest);
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(new Blob(['image'], { type: 'image/webp' })),
      ),
  );
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:test'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
  const busy = vi.fn();
  const { container } = render(
    <MerchantContext.Provider value={{ token: 'credential', storeId: 'store' }}>
      <ImageUpload name="imageUrl" onBusy={busy} />
    </MerchantContext.Provider>,
  );
  fireEvent.change(container.querySelector('input[type=file]')!, {
    target: { files: [new File(['png'], 'photo.png', { type: 'image/png' })] },
  });
  await waitFor(() => expect(UploadRequest.last.send).toHaveBeenCalled());
  const request = UploadRequest.last;
  expect(request.headers).toEqual({
    Authorization: 'Bearer credential',
    'X-Store-Id': 'store',
  });
  act(() =>
    request.upload.onprogress?.({
      lengthComputable: true,
      loaded: 1,
      total: 2,
    }),
  );
  expect(screen.getByText('50%')).toBeTruthy();
  request.responseText = JSON.stringify({
    imageUrl: '/api/v1/admin/media/12345678-1234-1234-1234-123456789abc',
  });
  await act(async () => {
    await request.onload?.();
  });
  expect(await screen.findByAltText('商品图片')).toBeTruthy();
  expect(screen.getByText('点击或拖拽更换图片')).toBeTruthy();
  expect(
    (container.querySelector('input[name=imageUrl]') as HTMLInputElement).value,
  ).toContain('/media/');
  fireEvent.click(screen.getByRole('button', { name: '移除图片' }));
  expect(
    (container.querySelector('input[name=imageUrl]') as HTMLInputElement).value,
  ).toBe('');
  expect(busy).toHaveBeenLastCalledWith(false);
});
