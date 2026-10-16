import { createContext, useContext, useState, type ReactNode } from 'react';
import { Alert, Button, Form, Input, Select, Modal } from 'antd';
import { ShopOutlined } from '@ant-design/icons';
import { createClient, AdminRequestError } from '../admin-client';
import type { Store } from '../admin-types';
interface Identity {
  id: string;
  role: string;
  storeIds: string[] | '*';
}
interface Session {
  token: string;
  identity: Identity;
  stores: Store[];
  storeId: string;
}
interface Access extends Session {
  logout: (expired?: boolean) => void;
  selectStore: (id: string) => void;
  addStore: (store: Store) => void;
}
const Context = createContext<Access | null>(null);
export function useSession() {
  const v = useContext(Context);
  if (!v) throw Error('缺少登录信息');
  return v;
}
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function login({ token }: { token: string }) {
    setBusy(true);
    setError('');
    try {
      const api = createClient(token.trim());
      const identity = await api<Identity>('/session');
      const stores = await api<Store[]>('/stores');
      if (!identity?.id || !Array.isArray(stores)) throw Error();
      const active = stores.filter((s) => s.status === 'ACTIVE');
      setSession({
        token: token.trim(),
        identity,
        stores: active,
        storeId: active.length === 1 ? active[0]!.id : '',
      });
    } catch (e) {
      setError(
        e instanceof AdminRequestError ? e.message : '暂时无法登录，请稍后重试',
      );
    } finally {
      setBusy(false);
    }
  }
  if (!session)
    return (
      <div className="login-page">
        <section className="login-intro">
          <div className="brand-mark">
            <ShopOutlined />
          </div>
          <span className="eyebrow">每天经营，心中有数</span>
          <h1>
            把门店生意
            <br />
            打理得更轻松
          </h1>
          <p>商品、订单与经营洞察，汇集在你的商家工作台。</p>
          <div className="login-pills">
            <span>商品管理</span>
            <span>门店协作</span>
            <span>经营分析</span>
          </div>
        </section>
        <section className="login-card">
          <h2>欢迎回到商家工作台</h2>
          <p className="muted">使用管理员提供的后台访问凭据登录</p>
          <Form layout="vertical" onFinish={login}>
            <Form.Item
              label="后台访问凭据"
              name="token"
              rules={[{ required: true, message: '请输入后台访问凭据' }]}
            >
              <Input.Password autoComplete="off" size="large" />
            </Form.Item>
            {error && <Alert type="error" title={error} showIcon />}
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={busy}
            >
              进入工作台
            </Button>
          </Form>
          <p className="hint">
            凭据只保留在当前页面内存中，刷新或退出后需重新登录。
          </p>
        </section>
      </div>
    );
  return (
    <Context.Provider
      value={{
        ...session,
        logout: (expired = false) => {
          setSession(null);
          setError(expired ? '登录已失效，请重新登录' : '');
        },
        selectStore: (id) =>
          setSession(
            (s) =>
              s && {
                ...s,
                storeId: s.stores.some((x) => x.id === id) ? id : '',
              },
          ),
        addStore: (store) =>
          setSession(
            (s) =>
              s && { ...s, stores: [...s.stores, store], storeId: store.id },
          ),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function StoreSwitch() {
  const s = useSession();
  return (
    <Select
      aria-label="当前门店"
      className="store-select"
      value={s.storeId || undefined}
      placeholder={s.stores.length ? '请选择门店' : '当前没有可用门店'}
      options={s.stores.map((x) => ({ value: x.id, label: x.name }))}
      onChange={s.selectStore}
    />
  );
}
export function CreateStore() {
  const s = useSession();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [form] = Form.useForm();
  if (s.identity.role !== 'OWNER' || s.identity.storeIds !== '*') return null;
  return (
    <>
      <Button onClick={() => setOpen(true)}>创建门店</Button>
      <Modal
        title="创建门店"
        open={open}
        onCancel={() => !busy && setOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={async (v) => {
            setBusy(true);
            setError('');
            try {
              const store = await createClient(s.token)<Store>(
                '/stores',
                'POST',
                { name: v.name.trim() },
              );
              if (!store?.id) throw Error();
              s.addStore(store);
              setOpen(false);
              form.resetFields();
            } catch (e) {
              setError(
                e instanceof AdminRequestError
                  ? e.message
                  : '门店创建失败，请刷新列表确认后重试',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Form.Item
            name="name"
            label="门店名称 · 必填"
            rules={[
              { required: true, whitespace: true, message: '请输入门店名称' },
            ]}
          >
            <Input maxLength={160} />
          </Form.Item>
          <p className="hint">
            系统自动：北京时间、营业中。地址等资料可稍后完善。
          </p>
          {error && <Alert type="error" title={error} />}
          <Button htmlType="submit" type="primary" loading={busy}>
            创建并进入门店
          </Button>
        </Form>
      </Modal>
    </>
  );
}
