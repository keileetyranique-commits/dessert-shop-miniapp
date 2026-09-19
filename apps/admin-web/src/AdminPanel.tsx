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
    [storeId, setStoreId] = useState('');
  async function login(data: Values) {
    const value = String(data.token),
      api = createClient(value);
    const identity = await api<NonNullable<typeof session>>('/session'),
      list = await api<Store[]>('/stores');
    setToken(value);
    setSession(identity);
    setStores(list);
    setStoreId(list[0]?.id ?? '');
  }
  if (!session)
    return (
      <section>
        <h2>登录成本中心</h2>
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
          {session.id} · {session.role}
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
            onSave={async (data) => {
              const api = createClient(token);
              const created = await api<Store>('/stores', 'POST', data);
              setStores(await api('/stores'));
              setStoreId(created.id);
            }}
          />
        </details>
      )}
      {storeId && (
        <Workspace
          key={token + storeId}
          token={token}
          storeId={storeId}
          role={session.role}
        />
      )}
    </section>
  );
}
