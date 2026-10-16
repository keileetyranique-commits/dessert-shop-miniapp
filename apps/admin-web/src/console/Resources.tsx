import { useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tabs,
  Tag,
} from 'antd';
import type { Product, Variant } from '../admin-types';
import { useCatalog, type Category } from './Data';
import { formatFen } from './catalog';
import { yuanToFen } from './product-save';
import { AdminRequestError } from '../admin-client';
export function CategoryManager({ onClose }: { onClose: () => void }) {
  const { categories, api, reload, canEdit, notify } = useCatalog();
  const [editing, setEditing] = useState<Category | null>(null),
    [confirm, setConfirm] = useState<Category | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [form] = Form.useForm();
  async function save({ name }: { name: string }) {
    setBusy(true);
    setError('');
    try {
      await api(
        editing ? '/categories/' + editing.id : '/categories',
        editing ? 'PATCH' : 'POST',
        { name: name.trim() },
      );
      await reload();
      notify('分类已保存');
      setEditing(null);
      form.resetFields();
    } catch {
      setError('分类未保存，请检查名称并重试');
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!confirm) return;
    setBusy(true);
    try {
      await api('/categories/' + confirm.id, 'DELETE');
      await reload();
      setConfirm(null);
    } catch (e) {
      setError(
        e instanceof AdminRequestError && e.status === 409
          ? '分类下仍有商品，请先移动或归档这些商品'
          : '分类归档失败，请刷新后重试',
      );
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      title="商品分类"
      onCancel={() => !busy && onClose()}
      footer={null}
      width={600}
    >
      <p className="muted">让顾客按分类找到想要的商品。</p>
      {categories.map((c) => (
        <div className="resource-row" key={c.id}>
          <strong>{c.name}</strong>
          <Space>
            {canEdit && (
              <>
                <Button
                  onClick={() => {
                    setEditing(c);
                    form.setFieldsValue({ name: c.name });
                  }}
                >
                  编辑
                </Button>
                <Button
                  danger
                  onClick={() => {
                    setError('');
                    setConfirm(c);
                  }}
                >
                  归档
                </Button>
              </>
            )}
          </Space>
        </div>
      ))}
      {canEdit && (
        <Form form={form} layout="vertical" onFinish={save}>
          <h3>{editing ? '编辑分类' : '新增分类'}</h3>
          <Form.Item
            name="name"
            label="分类名称 · 必填"
            rules={[
              { required: true, whitespace: true, message: '请输入分类名称' },
            ]}
          >
            <Input maxLength={160} />
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit" loading={busy}>
              保存分类
            </Button>
            {editing && (
              <Button
                onClick={() => {
                  setEditing(null);
                  form.resetFields();
                }}
              >
                取消编辑
              </Button>
            )}
          </Space>
        </Form>
      )}
      {error && <Alert type="error" title={error} />}
      <Modal
        title="确认归档分类"
        open={!!confirm}
        onCancel={() => setConfirm(null)}
        onOk={() => void archive()}
        confirmLoading={busy}
        okText="归档"
        cancelText="取消"
      >
        <p>
          归档“{confirm?.name}”后将从正常列表隐藏。分类下仍有商品时无法归档。
        </p>
      </Modal>
    </Modal>
  );
}
type ResourceDraft = {
  kind: 'variant' | 'group' | 'modifier';
  id?: string;
  groupId?: string;
  name: string;
  price?: string;
  status?: string;
  minSelections?: number;
  maxSelections?: number;
};
export function OptionManager({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const { api, reload, canEdit } = useCatalog();
  const [draft, setDraft] = useState<ResourceDraft | null>(null),
    [archive, setArchive] = useState<Variant | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function save(values: ResourceDraft) {
    if (!draft || !canEdit) return;
    setBusy(true);
    setError('');
    try {
      let path = '',
        body: object = {};
      if (draft.kind === 'variant') {
        path = draft.id
          ? '/variants/' + draft.id
          : '/products/' + product.id + '/variants';
        body = {
          name: values.name.trim(),
          salePriceFen: yuanToFen(values.price ?? ''),
          status: values.status,
          ...(!draft.id ? { unlimitedStock: true } : {}),
        };
      }
      if (draft.kind === 'group') {
        path = '/products/' + product.id + '/modifier-groups';
        body = {
          name: values.name.trim(),
          minSelections: values.minSelections,
          maxSelections: values.maxSelections,
        };
        if ((values.minSelections ?? 0) > (values.maxSelections ?? 1))
          throw Error('最少选择数不能大于最多选择数');
      }
      if (draft.kind === 'modifier') {
        path = draft.id
          ? '/modifiers/' + draft.id
          : '/modifier-groups/' + draft.groupId + '/modifiers';
        body = {
          name: values.name.trim(),
          salePriceFen: yuanToFen(values.price ?? ''),
          status: values.status,
        };
      }
      await api(path, draft.id ? 'PATCH' : 'POST', body);
      await reload();
      setDraft(null);
    } catch (e) {
      setError(
        e instanceof AdminRequestError
          ? '保存未完成，请检查权限和输入后重试'
          : e instanceof Error
            ? e.message
            : '保存失败，请重试',
      );
    } finally {
      setBusy(false);
    }
  }
  const variantTab = (
    <>
      <p className="muted">
        每个规格独立设置售价。新规格默认不限库存，库存调整在库存模块处理。
      </p>
      {product.variantRecords.map((v) => (
        <div className="resource-row" key={v.id}>
          <div>
            <strong>{v.name}</strong>
            <p>
              {formatFen(v.salePriceFen)} ·{' '}
              {v.status === 'ACTIVE' ? '已启用' : '已停用'}
            </p>
          </div>
          {canEdit && (
            <Space>
              <Button
                onClick={() =>
                  setDraft({
                    kind: 'variant',
                    id: v.id,
                    name: v.name,
                    price: formatFen(v.salePriceFen).slice(1),
                    status: v.status,
                  })
                }
              >
                编辑规格
              </Button>
              <Button danger onClick={() => setArchive(v)}>
                归档规格
              </Button>
            </Space>
          )}
        </div>
      ))}
      {canEdit && (
        <Button
          type="primary"
          onClick={() =>
            setDraft({ kind: 'variant', name: '', price: '', status: 'ACTIVE' })
          }
        >
          新增规格
        </Button>
      )}
    </>
  );
  const groupTab = (
    <>
      <p className="muted">
        支持加料、口味等通用附加选项。选项价格会独立展示，不改变商品基础售价。
      </p>
      {product.modifierGroupRecords.map((g) => (
        <section className="option-group" key={g.id}>
          <h3>{g.name}</h3>
          {g.modifierRecords.map((m) => (
            <div className="resource-row" key={m.id}>
              <span>
                {m.name} · {formatFen(m.salePriceFen)}{' '}
                <Tag>{m.status === 'ACTIVE' ? '已启用' : '已停用'}</Tag>
              </span>
              {canEdit && (
                <Button
                  onClick={() =>
                    setDraft({
                      kind: 'modifier',
                      id: m.id,
                      groupId: g.id,
                      name: m.name,
                      price: formatFen(m.salePriceFen).slice(1),
                      status: m.status,
                    })
                  }
                >
                  编辑选项
                </Button>
              )}
            </div>
          ))}
          {canEdit && (
            <Button
              onClick={() =>
                setDraft({
                  kind: 'modifier',
                  groupId: g.id,
                  name: '',
                  price: '0',
                  status: 'ACTIVE',
                })
              }
            >
              新增附加选项
            </Button>
          )}
        </section>
      ))}
      {canEdit && (
        <Button
          type="primary"
          onClick={() =>
            setDraft({
              kind: 'group',
              name: '',
              minSelections: 0,
              maxSelections: 1,
            })
          }
        >
          新增选项组
        </Button>
      )}
      <Alert
        className="boundary"
        type="info"
        title="当前支持新建选项组、新增和编辑选项、停用选项。选项组修改与删除尚未开放。"
      />
    </>
  );
  return (
    <Modal
      title={`${product.name} · 规格与附加选项`}
      open
      onCancel={() => !busy && onClose()}
      footer={null}
      width={760}
    >
      <Tabs
        items={[
          { key: 'variants', label: '商品规格', children: variantTab },
          { key: 'modifiers', label: '附加选项 / 加料', children: groupTab },
        ]}
      />
      {error && !draft && <Alert type="error" title={error} />}
      <Modal
        open={!!draft}
        title={
          draft?.kind === 'variant'
            ? '规格资料'
            : draft?.kind === 'group'
              ? '选项组资料'
              : '附加选项资料'
        }
        onCancel={() => !busy && setDraft(null)}
        footer={null}
        destroyOnHidden
      >
        {draft && (
          <Form
            key={draft.kind + (draft.id ?? draft.groupId ?? 'new')}
            layout="vertical"
            initialValues={draft}
            onFinish={save}
          >
            <Form.Item
              label="名称 · 必填"
              name="name"
              rules={[
                { required: true, whitespace: true, message: '请输入名称' },
              ]}
            >
              <Input maxLength={160} />
            </Form.Item>
            {draft.kind === 'group' ? (
              <div className="form-grid">
                <Form.Item label="最少选择数" name="minSelections">
                  <InputNumber min={0} max={100} precision={0} />
                </Form.Item>
                <Form.Item label="最多选择数" name="maxSelections">
                  <InputNumber min={1} max={100} precision={0} />
                </Form.Item>
              </div>
            ) : (
              <>
                <Form.Item
                  label="售价（元）· 必填"
                  name="price"
                  rules={[{ required: true, message: '请输入售价' }]}
                >
                  <Input prefix="¥" inputMode="decimal" />
                </Form.Item>
                <Form.Item label="状态" name="status">
                  <Select
                    options={[
                      { value: 'ACTIVE', label: '已启用' },
                      { value: 'INACTIVE', label: '已停用' },
                    ]}
                  />
                </Form.Item>
              </>
            )}
            {error && <Alert type="error" title={error} />}
            <div className="modal-actions">
              <Button onClick={() => setDraft(null)} disabled={busy}>
                取消
              </Button>
              <Button type="primary" htmlType="submit" loading={busy}>
                保存
              </Button>
            </div>
          </Form>
        )}
      </Modal>
      <Modal
        title="确认归档规格"
        open={!!archive}
        onCancel={() => !busy && setArchive(null)}
        okText="归档"
        cancelText="取消"
        confirmLoading={busy}
        onOk={async () => {
          if (!archive) return;
          setBusy(true);
          setError('');
          try {
            await api('/variants/' + archive.id, 'DELETE');
            await reload();
            setArchive(null);
          } catch {
            setError('规格归档失败，请刷新后重试');
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          归档“{archive?.name}
          ”后不能再用于当前经营，历史配方和成本快照仍然保留。
        </p>
      </Modal>
    </Modal>
  );
}
