import { useEffect, useState } from 'react';
import { fen, formatFen } from '@platform/shared';
import { createClient, AdminRequestError } from '../admin-client';
import type { Product as ApiProduct, Named } from '../admin-types';
import Products, { type Product, type Category } from './Products';
import { saveProduct } from './product-save';
import { adaptProduct } from './catalog-adapter';
import { useMerchantAccess } from './MerchantAccess';
export default function ProductReader() {
  const { storeId, stores, token, logout, identity } = useMerchantAccess();
  if (!storeId)
    return (
      <div className="bg-white border border-[#E5E5E5] rounded-lg p-12 text-center">
        {stores.length ? '请先在顶部选择门店' : '当前没有可用门店'}
      </div>
    );
  return (
    <StoreProducts
      key={storeId}
      storeId={storeId}
      token={token}
      canEdit={['OWNER', 'MANAGER'].includes(identity.role)}
      expired={() => logout(true)}
    />
  );
}
function StoreProducts({
  storeId,
  token,
  expired,
  canEdit,
}: {
  storeId: string;
  token: string;
  expired: () => void;
  canEdit: boolean;
}) {
  const [data, setData] = useState<{ rows: Product[]; categories: Category[] }>(
    { rows: [], categories: [] },
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    setData({ rows: [], categories: [] });
    const api = createClient(token, storeId);
    Promise.all([api<Named[]>('/categories'), api<ApiProduct[]>('/products')])
      .then(([categories, products]) => {
        if (!Array.isArray(categories) || !Array.isArray(products))
          throw new Error();
        const mapped = {
          categories: categories.map((c) => ({ id: c.id, name: c.name })),
          rows: products.map(adaptProduct),
        };
        if (current) setData(mapped);
      })
      .catch((e) => {
        if (!current) return;
        if (e instanceof AdminRequestError && e.status === 401) expired();
        else
          setError(
            e instanceof AdminRequestError && e.status === 403
              ? e.message
              : '商品暂时无法加载，请稍后重试',
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
    // The keyed component owns one store/session; an old response cannot update a new store.
  }, [token, storeId, attempt]);
  return (
    <>
      <Products
        {...data}
        loading={loading}
        error={error}
        mediaAccess={{ token, storeId, canEdit, onExpired: expired }}
        onSave={async (draft, id) => {
          if (!canEdit) throw new Error('当前账号无权保存商品');
          const original = data.rows.find((row) => row.id === id);
          const result = await saveProduct(
            createClient(token, storeId),
            draft,
            id,
            original
              ? {
                  ...original,
                  price:
                    original.priceFen === null
                      ? ''
                      : formatFen(fen(original.priceFen)),
                }
              : undefined,
          );
          const row = adaptProduct(result);
          setData((current) => ({
            ...current,
            rows: id
              ? current.rows.map((item) => (item.id === id ? row : item))
              : [...current.rows, row],
          }));
        }}
        onImageSaved={(id, image) =>
          setData((current) => ({
            ...current,
            rows: current.rows.map((row) =>
              row.id === id ? { ...row, image } : row,
            ),
          }))
        }
      />
      {error && (
        <button
          className="mt-4 text-primary"
          onClick={() => setAttempt((n) => n + 1)}
        >
          重新加载
        </button>
      )}
    </>
  );
}
