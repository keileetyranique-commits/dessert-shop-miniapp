import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import Products from './Products';
import { ProductImage } from './ProductMedia';
import { type MediaAccess } from './media-client';
const path = '/api/v1/admin/media/11111111-1111-4111-8111-111111111111';
const access: MediaAccess = {
  token: 'test-token',
  storeId: 'store-a',
  canEdit: true,
  onExpired: vi.fn(),
};
let xhr: FakeXHR;
class FakeXHR {
  upload = {
    onprogress: null as
      | ((e: {
          lengthComputable: boolean;
          loaded: number;
          total: number;
        }) => void)
      | null,
  };
  status = 201;
  responseText = JSON.stringify({ imageUrl: path });
  timeout = 0;
  headers: Record<string, string> = {};
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  open = vi.fn();
  setRequestHeader = (key: string, value: string) => {
    this.headers[key] = value;
  };
  send = vi.fn();
  abort = vi.fn(() => this.onabort?.());
  constructor() {
    // Expose the test transport so tests can emit browser upload events.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    xhr = this;
  }
}
beforeEach(() => {
  let count = 0;
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => 'blob:test-' + ++count);
      static revokeObjectURL = vi.fn();
    },
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'PATCH'
        ? new Response(null, { status: 204 })
        : new Response('webp', { headers: { 'Content-Type': 'image/webp' } }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const row = {
  id: 'product-a',
  title: '真实商品',
  description: '描述',
  category_id: 'c',
  image: 'https://example.com/old.jpg',
  available: true,
  priceFen: 1880,
};
function edit() {
  render(
    <Products
      rows={[row]}
      categories={[{ id: 'c', name: '分类' }]}
      mediaAccess={access}
      onImageSaved={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  return within(screen.getByRole('dialog'));
}
function choose() {
  fireEvent.change(screen.getByLabelText('选择图片'), {
    target: { files: [new File(['png'], '图片.png', { type: 'image/png' })] },
  });
}
test('受保护图片使用当前凭据和 Blob，换店立即清除并释放旧地址', async () => {
  const view = render(
    <ProductImage image={path} title="图片" access={access} />,
  );
  await screen.findByRole('img');
  expect(fetch).toHaveBeenCalledWith(
    path,
    expect.objectContaining({
      headers: { Authorization: 'Bearer test-token', 'X-Store-Id': 'store-a' },
      cache: 'no-store',
    }),
  );
  expect(screen.getByRole('img').getAttribute('src')).toBe('blob:test-1');
  let resolve!: (r: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  view.rerender(
    <ProductImage
      image={path}
      title="图片"
      access={{ ...access, storeId: 'store-b' }}
    />,
  );
  expect(screen.queryByRole('img')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1');
  view.unmount();
  resolve(new Response('x', { headers: { 'Content-Type': 'image/webp' } }));
  await Promise.resolve();
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
});
test('公开图片不携带后台凭据，失败有中文提示', () => {
  render(<ProductImage image={row.image} title="公开图片" access={access} />);
  expect(screen.getByRole('img').getAttribute('src')).toBe(row.image);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.error(screen.getByRole('img'));
  expect(screen.getByText('图片读取失败，请更换图片或稍后重试')).toBeTruthy();
});
test('上传有本地预览及进度，保存和移除仅 PATCH imageUrl，不保存其他字段', async () => {
  const dialog = edit();
  expect((dialog.getByLabelText('商品名称') as HTMLInputElement).disabled).toBe(
    false,
  ); // disabled by fieldset
  expect(dialog.getByLabelText('商品名称').closest('fieldset')?.disabled).toBe(
    true,
  );
  choose();
  expect(screen.getByAltText('待上传图片预览')).toBeTruthy();
  expect(xhr.headers).toEqual({
    Authorization: 'Bearer test-token',
    'X-Store-Id': 'store-a',
  });
  expect(xhr.open).toHaveBeenCalledWith('POST', '/api/v1/admin/media');
  xhr.upload.onprogress?.({ lengthComputable: true, loaded: 60, total: 100 });
  await waitFor(() =>
    expect(screen.getByRole('progressbar').getAttribute('value')).toBe('60'),
  );
  expect(fetch).not.toHaveBeenCalled();
  xhr.onload?.();
  await screen.findByText('上传成功，点击“保存图片”或“保存商品”后生效');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1');
  expect(
    vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PATCH'),
  ).toHaveLength(0);
  fireEvent.click(dialog.getByRole('button', { name: '保存图片' }));
  await screen.findByText('商品图片已保存');
  let writes = vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => init?.method === 'PATCH');
  expect(writes).toHaveLength(1);
  expect(writes[0]?.[0]).toBe('/api/v1/admin/products/product-a');
  expect(JSON.parse(String(writes[0]?.[1]?.body))).toEqual({ imageUrl: path });
  fireEvent.click(dialog.getByRole('button', { name: '移除图片' }));
  expect(
    vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PATCH'),
  ).toHaveLength(1);
  fireEvent.click(dialog.getByRole('button', { name: '保存图片' }));
  await screen.findByText('商品图片已移除');
  writes = vi
    .mocked(fetch)
    .mock.calls.filter(([, init]) => init?.method === 'PATCH');
  expect(JSON.parse(String(writes[1]?.[1]?.body))).toEqual({ imageUrl: '' });
});
test.each([400, 401, 403, 413, 500])(
  '上传失败不修改商品，状态 %s',
  async (status) => {
    edit();
    choose();
    xhr.status = status;
    xhr.responseText = '<html>secret error</html>';
    xhr.onload?.();
    await waitFor(() =>
      expect(screen.queryByAltText('待上传图片预览')).toBeNull(),
    );
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(([, init]) => init?.method === 'PATCH'),
    ).toHaveLength(0);
    expect(screen.queryByText('secret error')).toBeNull();
    if (status === 401) expect(access.onExpired).toHaveBeenCalled();
    else expect(screen.getByRole('alert')).toBeTruthy();
  },
);
test('无效格式、大小不上传，关闭弹窗中止上传并释放预览', () => {
  edit();
  fireEvent.change(screen.getByLabelText('选择图片'), {
    target: { files: [new File(['svg'], 'x.svg', { type: 'image/svg+xml' })] },
  });
  expect(screen.getByRole('alert').textContent).toContain('请选择 JPG');
  const big = new File(['x'], 'x.png', { type: 'image/png' });
  Object.defineProperty(big, 'size', { value: 5242881 });
  fireEvent.change(screen.getByLabelText('选择图片'), {
    target: { files: [big] },
  });
  expect(screen.getByRole('alert').textContent).toContain('5 MB');
  choose();
  fireEvent.click(screen.getByRole('button', { name: '关闭编辑窗口' }));
  expect(xhr.abort).toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1');
});
test('图片读取 401 重新登录，403 和失败不显示原始错误', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(new Response('raw', { status: 403 }));
  const view = render(
    <ProductImage image={path} title="图片" access={access} />,
  );
  await screen.findByText('没有当前门店的图片操作权限，请联系管理员');
  expect(screen.queryByRole('img')).toBeNull();
  view.unmount();
  vi.mocked(fetch).mockResolvedValueOnce(new Response('raw', { status: 401 }));
  render(<ProductImage image={path} title="图片" access={access} />);
  await waitFor(() => expect(access.onExpired).toHaveBeenCalled());
});

test('上传网络失败和无效响应不写商品；保存 404 保留中文失败提示', async () => {
  edit();
  choose();
  xhr.onerror?.();
  await screen.findByText('网络连接失败，图片未上传，请重试');
  expect(fetch).not.toHaveBeenCalled();
  choose();
  xhr.responseText = '';
  xhr.onload?.();
  await screen.findByText('上传结果暂时无法读取，请重试');
  expect(fetch).not.toHaveBeenCalled();
  choose();
  xhr.onload?.();
  await screen.findByText('上传成功，点击“保存图片”或“保存商品”后生效');
  vi.mocked(fetch).mockImplementation(async (_url, init) =>
    init?.method === 'PATCH'
      ? new Response('<html>raw</html>', { status: 404 })
      : new Response('webp', { headers: { 'Content-Type': 'image/webp' } }),
  );
  fireEvent.click(screen.getByRole('button', { name: '保存图片' }));
  await screen.findByText('商品或图片不存在，或不属于当前门店，请刷新后重试');
  expect(screen.queryByText('商品图片已保存')).toBeNull();
});

test('新增复用图片上传，上传中禁止保存，完成后图片随商品提交', async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <Products
      categories={[{ id: 'c', name: '分类一' }]}
      mediaAccess={access}
      onSave={save}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '新增商品' }));
  fireEvent.change(screen.getByLabelText('商品名称'), {
    target: { value: '新品' },
  });
  fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('分类'), {
    target: { value: 'c' },
  });
  fireEvent.change(screen.getByLabelText('售价（元）'), {
    target: { value: '18.80' },
  });
  fireEvent.change(screen.getByLabelText('选择图片'), {
    target: { files: [new File(['png'], 'photo.png', { type: 'image/png' })] },
  });
  expect(
    (screen.getByRole('button', { name: '保存商品' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.queryByRole('button', { name: '保存图片' })).toBeNull();
  xhr.onload?.();
  await screen.findByText('上传成功，保存商品后生效');
  fireEvent.click(screen.getByRole('button', { name: '保存商品' }));
  await waitFor(() =>
    expect(save).toHaveBeenCalledWith(
      {
        title: '新品',
        category_id: 'c',
        price: '18.80',
        description: '',
        image: path,
        available: true,
      },
      undefined,
    ),
  );
  expect(
    vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'PATCH'),
  ).toBe(false);
});
