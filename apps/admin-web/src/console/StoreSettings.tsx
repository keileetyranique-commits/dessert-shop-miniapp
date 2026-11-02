import { useEffect, useState } from 'react';
import { Alert, Button, Collapse, Form, Input, Spin } from 'antd';
import { useCatalog } from './Data';
import { useSession } from './Session';
import type { Store } from '../admin-types';
export function StoreSettings() {
  const { api } = useCatalog();
  const session = useSession();
  const [form] = Form.useForm();
  const [store, setStore] = useState<Store>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, refresh] = useState(0);
  const owner = session.identity.role === 'OWNER';
  useEffect(() => {
    let active = true;
    setStore(undefined);
    setError('');
    api<Store>('/store')
      .then((value) => {
        if (active) {
          setStore(value);
          form.setFieldsValue(value);
        }
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : '门店资料加载失败');
      });
    return () => {
      active = false;
    };
  }, [api, form, revision]);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>门店资料</h1>
          <p>完善顾客联系和到店所需的基本信息。</p>
        </div>
      </div>
      {error && <Alert type="error" title={error} showIcon />}
      {notice && <Alert type="success" title={notice} showIcon />}
      {!store ? (
        error ? (
          <Button onClick={() => refresh((n) => n + 1)}>重新加载</Button>
        ) : (
          <Spin description="正在加载门店资料" />
        )
      ) : (
        <section className="panel">
          {!owner && (
            <Alert title="当前为只读，请联系老板修改门店资料。" type="info" />
          )}
          <Form
            form={form}
            layout="vertical"
            disabled={!owner || busy}
            onFinish={async (values: {
              name: string;
              address: string;
              contactPhone: string;
              businessHours: string;
            }) => {
              if (!owner || busy) return;
              setBusy(true);
              setError('');
              setNotice('');
              try {
                const saved = await api<Store>('/store', 'PATCH', {
                  name: values.name.trim(),
                  address: values.address ?? '',
                  contactPhone: values.contactPhone ?? '',
                  businessHours: values.businessHours ?? '',
                });
                setStore(saved);
                form.setFieldsValue(saved);
                session.updateStore(saved);
                setNotice('门店资料已保存');
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : '门店资料保存失败，请重试',
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Form.Item
              name="name"
              label="门店名称（必填）"
              rules={[
                { required: true, whitespace: true, message: '请输入门店名称' },
              ]}
            >
              <Input maxLength={160} />
            </Form.Item>
            <Collapse
              items={[
                {
                  key: 'optional',
                  label: '联系与营业说明（选填）',
                  forceRender: true,
                  children: (
                    <>
                      <Form.Item name="address" label="门店地址（选填）">
                        <Input.TextArea maxLength={500} />
                      </Form.Item>
                      <Form.Item name="contactPhone" label="联系电话（选填）">
                        <Input maxLength={80} />
                      </Form.Item>
                      <Form.Item
                        name="businessHours"
                        label="营业时间说明（选填）"
                      >
                        <Input.TextArea maxLength={1000} />
                      </Form.Item>
                      <p className="muted">
                        营业时间说明用于展示，不会自动改变接单时间或门店状态。
                      </p>
                    </>
                  ),
                },
              ]}
            />
            <p className="muted">
              系统记录时间按中国标准时间（北京时间）展示。当前门店状态：
              {store.status === 'ACTIVE' ? '营业中' : '已停用'}。
            </p>
            {owner && (
              <Button type="primary" htmlType="submit" loading={busy}>
                保存门店资料
              </Button>
            )}
          </Form>
        </section>
      )}
    </>
  );
}
