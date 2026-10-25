import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Alert, Button, Spin } from 'antd';
import { createClient, AdminRequestError } from '../admin-client';
import type { Client, Named, Product } from '../admin-types';
import { useSession, CreateStore } from './Session';
export interface Category extends Named {
  status: string;
}
interface Data {
  products: Product[];
  categories: Category[];
  api: Client;
  reload: () => Promise<void>;
  canEdit: boolean;
  notice: string;
  notify: (text: string) => void;
}
const Context = createContext<Data | null>(null);
export function useCatalog() {
  const value = useContext(Context);
  if (!value) throw Error('缺少商品数据');
  return value;
}
/** POS reuses order UI without loading privileged product/cost payloads. */
export function OrderOnlyProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const api = useMemo(
    () => createClient(session.token, session.storeId),
    [session.token, session.storeId],
  );
  return (
    <Context.Provider
      value={{
        api,
        products: [],
        categories: [],
        canEdit: ['OWNER', 'MANAGER'].includes(session.identity.role),
        reload: async () => {},
        notice: '',
        notify: () => {},
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function CatalogProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const [products, setProducts] = useState<Product[]>([]),
    [categories, setCategories] = useState<Category[]>([]),
    [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(''),
    [notice, notify] = useState('');
  const api = useMemo(
    () => createClient(session.token, session.storeId),
    [session.token, session.storeId],
  );
  const reload = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([
        api<Product[]>('/products'),
        api<Category[]>('/categories'),
      ]);
      if (!Array.isArray(p) || !Array.isArray(c)) throw Error();
      setProducts(p);
      setCategories(c);
      setLoaded(true);
      setError('');
    } catch (e) {
      setError(
        e instanceof AdminRequestError
          ? e.message
          : '商品暂时无法加载，请稍后重试',
      );
      throw e;
    }
  }, [api]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const client = createClient(
      session.token,
      session.storeId,
      controller.signal,
    );
    setLoading(true);
    Promise.all([
      client<Product[]>('/products'),
      client<Category[]>('/categories'),
    ])
      .then(([p, c]) => {
        if (!Array.isArray(p) || !Array.isArray(c)) throw Error();
        if (active) {
          setProducts(p);
          setCategories(c);
          setLoaded(true);
          setError('');
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof AdminRequestError
              ? e.message
              : '商品暂时无法加载，请稍后重试',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [session.token, session.storeId]);
  return (
    <Context.Provider
      value={{
        products,
        categories,
        api,
        reload,
        canEdit: ['OWNER', 'MANAGER'].includes(session.identity.role),
        notice,
        notify,
      }}
    >
      {loading ? (
        <div className="page-loading">
          <Spin />
          <p>正在加载门店资料…</p>
        </div>
      ) : (
        <>
          {error && (
            <Alert
              type="error"
              showIcon
              title={error}
              action={
                <Button
                  onClick={() => {
                    void reload().catch(() => {});
                  }}
                >
                  重新加载
                </Button>
              }
            />
          )}
          {loaded && children}
        </>
      )}
    </Context.Provider>
  );
}
export function StoreGate({ children }: { children: ReactNode }) {
  const s = useSession();
  return s.storeId ? (
    <CatalogProvider key={s.storeId}>{children}</CatalogProvider>
  ) : (
    <section className="panel blank-page">
      <h2>{s.stores.length ? '请选择一家门店' : '当前没有可用门店'}</h2>
      <p className="muted">选择门店后，即可查看和管理它的商品。</p>
      <CreateStore />
    </section>
  );
}
