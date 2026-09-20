import { MerchantContext } from './MerchantContext';
import { labels } from './localization';
import { useState } from 'react';
import { Editor, type Values } from './Editor';
import type { Store } from './admin-types';
import { createClient } from './admin-client';
import { storeFields } from './admin-fields';
import { Workspace } from './StoreWorkspace';
export { CostResult } from './CostEditors';
export function AdminPanel() {
  const [token, setToken] = useState(''),
    [session, setSession] = useState<{
      id: string;
      role: string;
      storeIds: string[] | '*';
    } | null>(null),
    [stores, setStores] = useState<Store[]>([]),
    [storeId, setStoreId] = useState(''),
    [notice, setNotice] = useState('');
  async function login(data: Values) {
    const value = String(data.token),
      api = createClient(value);
    const identity = await api<NonNullable<typeof session>>('/session'),
      list = await api<Store[]>('/stores');
    setNotice('');
    setToken(value);
    setSession(identity);
    setStores(list);
    setStoreId(list[0]?.id ?? '');
  }
  if (!session)
    return (
      <section>
        <h2>登录商家后台</h2>
        <p>
          使用管理员配置的访问凭据。凭据只保留在本页内存中，刷新或退出后需要重新输入。
        </p>
        <Editor
          title="登录"
          fields={[{ name: 'token', label: '后台访问凭据', type: 'password' }]}
          onSave={login}
        />
      </section>
    );
  return (
    <section>
      <div className="toolbar">
        <h2>商品与成本中心</h2>
        <span>
          {session.id} · {labels[session.role]}
        </span>
        <button
          onClick={() => {
            setToken('');
            setSession(null);
            setStores([]);
            setStoreId('');
          }}
        >
          退出
        </button>
      </div>
      {notice && <p role="alert">{notice}</p>}
      <label>
        当前授权门店
        <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="">请选择门店</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {session.role === 'OWNER' && session.storeIds === '*' && (
        <details>
          <summary>创建门店</summary>
          <Editor
            title="新门店"
            fields={storeFields}
            automatic="北京时间；营业中"
            onSave={async (data) => {
              const api = createClient(token);
              const created = await api<Store | undefined>(
                '/stores',
                'POST',
                data,
              );
              const list = await api<Store[]>('/stores');
              if (!Array.isArray(list))
                throw Error(
                  '门店已提交，但列表未能更新，请刷新确认，不要重复创建',
                );
              setStores(list);
              const added = list.filter(
                (s) => !stores.some((old) => old.id === s.id),
              );
              const id =
                created?.id ?? (added.length === 1 ? added[0]!.id : undefined);
              if (!id)
                throw Error('门店已提交，请刷新列表确认结果，不要重复创建');
              setStoreId(id);
            }}
          />
        </details>
      )}
      {!storeId && <p>请选择门店，或先创建一家门店。</p>}
      {storeId && (
        <MerchantContext.Provider value={{ token, storeId }}>
          <Workspace
            key={token + storeId}
            token={token}
            storeId={storeId}
            role={session.role}
            onArchived={async () => {
              const remaining = stores.filter((s) => s.id !== storeId);
              setStores(remaining);
              setStoreId(remaining[0]?.id ?? '');
              setNotice('');
              try {
                const list = await createClient(token)<Store[]>('/stores');
                setStores(list);
                setStoreId(list[0]?.id ?? '');
              } catch {
                setNotice(
                  '门店已归档，暂时无法刷新其他门店，请稍后重新登录确认',
                );
              }
            }}
          />
        </MerchantContext.Provider>
      )}
    </section>
  );
}
