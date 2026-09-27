import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type FormEvent,
} from 'react';
import { createClient, AdminRequestError } from '../admin-client';
import type { Store } from '../admin-types';
interface Identity {
  id: string;
  role: string;
  merchantId: string;
  brandId: string;
  storeIds: string[] | '*';
}
interface Session {
  token: string;
  identity: Identity;
  stores: Store[];
  storeId: string;
}
interface Access extends Session {
  selectStore: (id: string) => void;
  logout: (expired?: boolean) => void;
}
const Context = createContext<Access | null>(null);
export function useMerchantAccess() {
  const value = useContext(Context);
  if (!value) throw new Error('Merchant session required');
  return value;
}
export function MerchantAccess({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [credential, setCredential] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const token = credential.trim();
    try {
      const api = createClient(token);
      const identity = await api<Identity>('/session');
      if (
        !identity?.id ||
        !identity.role ||
        !identity.merchantId ||
        !identity.brandId
      )
        throw new Error();
      const result = await api<Store[]>('/stores');
      if (!Array.isArray(result)) throw new Error();
      const stores = result.filter((s) => s.status === 'ACTIVE');
      setSession({
        token,
        identity,
        stores,
        storeId: stores.length === 1 ? (stores[0]?.id ?? '') : '',
      });
      setCredential('');
    } catch (e) {
      setError(
        e instanceof AdminRequestError
          ? e.message
          : '登录暂时无法完成，请稍后重试',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!session)
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <form
          onSubmit={login}
          className="bg-white border border-[#E5E5E5] rounded-lg p-8 w-full max-w-md space-y-5"
        >
          <h1 className="text-lg font-semibold">登录商家后台</h1>
          <p className="text-sm text-[#6B7280]">
            使用管理员提供的访问凭据。凭据仅保留在本页内存，刷新或退出后需重新登录。
          </p>
          <label className="block text-sm">
            后台访问凭据
            <input
              required
              type="password"
              autoComplete="off"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              className="mt-2 w-full border border-[#E5E5E5] rounded px-3 py-2"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            disabled={busy || !credential.trim()}
            className="w-full bg-primary text-white rounded px-4 py-2 disabled:opacity-50"
          >
            {busy ? '登录中…' : '登录'}
          </button>
        </form>
      </main>
    );
  return (
    <Context.Provider
      value={{
        ...session,
        selectStore: (id) =>
          setSession(
            (s) =>
              s && {
                ...s,
                storeId: s.stores.some((store) => store.id === id) ? id : '',
              },
          ),
        logout: (expired = false) => {
          setSession(null);
          setCredential('');
          setError(expired ? '登录已失效，请重新登录' : '');
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function StoreSelector() {
  const { stores, storeId, selectStore, logout } = useMerchantAccess();
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label>
        当前门店{' '}
        <select
          aria-label="当前门店"
          value={storeId}
          onChange={(e) => selectStore(e.target.value)}
          className="border border-[#E5E5E5] rounded px-2 py-1 max-w-40"
        >
          <option value="">
            {stores.length ? '请选择门店' : '当前没有可用门店'}
          </option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <button onClick={() => logout()} className="text-[#6B7280]">
        退出
      </button>
    </div>
  );
}
