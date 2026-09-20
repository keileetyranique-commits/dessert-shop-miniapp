// Derived from jamezzh7/open-shop-wechat-template (ffa309206aea6a323493850cdf364ad0565b9fcd).
// Copyright (c) 2026 James Zhuang and Open Shop contributors. MIT; see public/third-party/open-shop-LICENSE.txt.
// Adapted for this project's read-only merchant shell; no CloudBase or mutation APIs.
import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useId,
  type ReactNode,
} from 'react';
import { fen, formatFen } from '@platform/shared';
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onCancel={onClose}
      className="m-auto p-0 bg-transparent max-w-[calc(100%-32px)]"
    >
      <div className="bg-white rounded-lg border border-[#E5E5E5] w-[480px] max-w-full max-h-[85vh] overflow-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E5E5]">
          <span id={titleId} className="font-medium text-[#1A1A1A]">
            {title}
          </span>
          <button
            autoFocus
            aria-label="关闭编辑窗口"
            onClick={onClose}
            className="text-[#6B7280] hover:text-[#1A1A1A] text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-[#1A1A1A] mb-1.5">
        <span className="block mb-1.5">{label}</span>
        {children}
      </label>
    </div>
  );
}

const inputCls =
  'w-full border border-[#E5E5E5] rounded px-3 py-2 text-sm outline-none focus:border-primary transition-colors';
function SearchBar({
  value,
  onChange,
  placeholder,
  resultCount,
  totalCount,
  loading = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  resultCount: number;
  totalCount: number;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:flex-1 lg:max-w-[500px]">
      <div className="relative w-full sm:max-w-[360px]">
        <input
          className="w-full border border-[#E5E5E5] rounded px-3 py-2 pr-16 text-sm outline-none focus:border-primary transition-colors"
          aria-label="搜索商品"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs text-[#6B7280] hover:text-[#1A1A1A]"
          >
            清除
          </button>
        )}
      </div>
      <span className="text-xs text-[#6B7280] whitespace-nowrap shrink-0">
        {loading
          ? '加载中…'
          : value
            ? `筛选出 ${resultCount} / ${totalCount} 条`
            : `共 ${totalCount} 条`}
      </span>
    </div>
  );
}

function TableStateRow({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="py-10 px-4 text-center text-sm text-[#6B7280]"
      >
        <div className="sticky left-4 max-w-[calc(100vw-64px)] md:static md:max-w-none">
          {children}
        </div>
      </td>
    </tr>
  );
}

export interface Category {
  id: string;
  name: string;
}
export interface Product {
  id: string;
  category_id: string;
  title: string;
  description: string;
  image: string;
  available: boolean;
  priceFen: number | null;
  multiplePrices?: boolean;
}
const EMPTY_PRODUCTS: Product[] = [];
const EMPTY_CATEGORIES: Category[] = [];
function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}
// Presentational Open Shop page; API mapping lives in catalog-adapter.
export default function Products({
  rows = EMPTY_PRODUCTS,
  categories = EMPTY_CATEGORIES,
  loading = false,
  error = false,
}: {
  rows?: Product[];
  categories?: Category[];
  loading?: boolean;
  error?: boolean | string;
}) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' | 'edit' } | null>(null);
  const [form, setForm] = useState({
    title: '',
    category_id: '',
    price: '',
    description: '',
  });
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const filteredRows = useMemo(() => {
    const query = normalizeSearch(search);
    return rows.filter(
      (row) =>
        (!categoryFilter || row.category_id === categoryFilter) &&
        [
          row.title,
          row.description,
          categoryById.get(row.category_id)?.name ?? '',
        ].some((value) => normalizeSearch(value).includes(query)),
    );
  }, [categoryById, rows, search, categoryFilter]);
  function openCreate() {
    setForm({ title: '', category_id: '', price: '', description: '' });
    setModal({ mode: 'create' });
  }
  function openEdit(row: Product) {
    setForm({
      title: row.title,
      category_id: row.category_id,
      price: row.priceFen === null ? '' : formatFen(fen(row.priceFen)),
      description: row.description,
    });
    setModal({ mode: 'edit' });
  }
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-[#1A1A1A]">商品管理</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          集中管理商品信息、分类与上架状态。
        </p>
      </div>
      <p className="text-sm text-primary bg-primary-light border border-[#E5DDF7] rounded-lg px-4 py-3">
        当前仅支持查看商品。新增和编辑窗口暂未接入保存，填写内容不会保存。
      </p>
      <div className="flex flex-col gap-3 mb-4 lg:flex-row lg:items-center lg:justify-between">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="搜索商品名称、分类或描述"
          resultCount={filteredRows.length}
          totalCount={rows.length}
          loading={loading}
        />
        <label className="text-sm text-[#6B7280] flex items-center gap-2">
          分类
          <select
            aria-label="分类筛选"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border border-[#E5E5E5] bg-white rounded px-3 py-2 min-w-36 text-[#1A1A1A]"
          >
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-primary text-white text-sm rounded hover:bg-primary-hover transition-colors"
        >
          新增商品
        </button>
      </div>
      <div className="bg-white rounded-lg border border-[#E5E5E5] overflow-x-auto">
        <table className="w-full min-w-[680px]" aria-label="商品列表">
          <thead className="bg-[#F9F9F9] border-b border-[#E5E5E5]">
            <tr>
              <th className="py-3 px-4 text-left text-xs font-medium text-[#6B7280] w-24">
                图片
              </th>
              <th className="py-3 px-4 text-left text-xs font-medium text-[#6B7280]">
                商品
              </th>
              <th className="py-3 px-4 text-left text-xs font-medium text-[#6B7280]">
                分类
              </th>
              <th className="py-3 px-4 text-left text-xs font-medium text-[#6B7280]">
                售价
              </th>
              <th className="py-3 px-4 text-left text-xs font-medium text-[#6B7280]">
                状态
              </th>
              <th className="py-3 px-4 text-right text-xs font-medium text-[#6B7280]">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <TableStateRow colSpan={6}>商品加载中…</TableStateRow>
            ) : error ? (
              <TableStateRow colSpan={6}>
                {typeof error === 'string'
                  ? error
                  : '商品暂时无法加载，请稍后重试'}
              </TableStateRow>
            ) : (
              filteredRows.map((row) => {
                const cat = categoryById.get(row.category_id);
                return (
                  <tr key={row.id} className="border-b border-[#E5E5E5]">
                    <td className="py-3 px-4">
                      <ProductImage
                        key={row.image}
                        image={row.image}
                        title={row.title}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm font-medium">{row.title}</p>
                      <p className="text-xs text-[#6B7280]">
                        {row.description}
                      </p>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {cat?.name ?? '未分类'}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {row.priceFen === null
                        ? '待设置'
                        : `¥${formatFen(fen(row.priceFen))}${row.multiplePrices ? ' 起' : ''}`}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${row.available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                      >
                        {row.available ? '已上架' : '已下架'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      <button
                        onClick={() => openEdit(row)}
                        className="text-xs text-primary hover:underline"
                      >
                        编辑
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
            {!loading && !error && filteredRows.length === 0 && (
              <TableStateRow colSpan={6}>
                <div className="py-12">
                  <p className="text-base text-[#1A1A1A] mb-2">
                    {rows.length ? '没有找到匹配的商品' : '暂无商品数据'}
                  </p>
                  <p>
                    {rows.length
                      ? '试试其他关键词或分类'
                      : '当前门店尚无商品。'}
                  </p>
                </div>
              </TableStateRow>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal
          title={modal.mode === 'create' ? '新增商品' : '编辑商品'}
          onClose={() => setModal(null)}
        >
          <p className="text-xs text-[#6B7280] mb-5">
            编辑窗口预览，暂未接入保存功能。
          </p>
          <fieldset>
            <legend className="text-sm font-medium mb-3">必填</legend>
            <Field label="商品名称">
              <input
                className={inputCls}
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="请输入商品名称"
              />
            </Field>
            <Field label="分类">
              <select
                className={inputCls}
                value={form.category_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category_id: e.target.value }))
                }
              >
                <option value="">请选择分类</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="售价（元）">
              <input
                className={inputCls}
                inputMode="decimal"
                value={form.price}
                onChange={(e) =>
                  setForm((f) => ({ ...f, price: e.target.value }))
                }
                placeholder="例如 18.80"
              />
            </Field>
          </fieldset>
          <div className="mb-4">
            <p className="text-sm font-medium mb-1.5">商品图片（推荐）</p>
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded border border-dashed border-[#E5E5E5] bg-[#F9F9F9] flex items-center justify-center text-xs text-[#6B7280]">
                图片预览
              </div>
              <div>
                <button disabled className="text-sm text-primary opacity-60">
                  选择图片
                </button>
                <p className="text-xs text-[#6B7280] mt-1">
                  图片上传将在后续接入
                </p>
              </div>
            </div>
          </div>
          <details className="mb-4">
            <summary className="text-sm font-medium mb-3">
              选填 · 更多设置
            </summary>
            <Field label="商品描述">
              <textarea
                className={inputCls}
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </Field>
          </details>
          <p className="text-xs text-[#6B7280]">
            系统自动字段将在保存功能接入后生成
          </p>
          <div className="flex justify-end space-x-2 mt-6 pt-4 border-t border-[#E5E5E5]">
            <button
              onClick={() => setModal(null)}
              className="px-4 py-2 text-sm text-[#6B7280] hover:text-[#1A1A1A]"
            >
              关闭预览
            </button>
            <button
              disabled
              className="px-4 py-2 bg-primary text-white text-sm rounded opacity-50"
            >
              保存（后续接入）
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function ProductImage({ image, title }: { image: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return image && !failed ? (
    <img
      src={image}
      alt={title}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-12 h-12 rounded object-cover"
    />
  ) : (
    <div className="w-12 h-12 rounded bg-[#F5F5F5] text-xs text-[#6B7280] flex items-center justify-center">
      暂无图片
    </div>
  );
}
