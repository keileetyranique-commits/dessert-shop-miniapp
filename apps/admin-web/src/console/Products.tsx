import { useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Tabs,
  Tag,
  Form,
  Switch,
  Collapse,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  AppstoreOutlined,
  EditOutlined,
} from '@ant-design/icons';
import type { Product } from '../admin-types';
import { useCatalog } from './Data';
import { useSession } from './Session';
import { ProductImage, ImageEditor } from './Media';
import { filterProducts, formatFen, productState } from './catalog';
import { adaptProduct } from './catalog-adapter';
import { saveProduct, type ProductDraft } from './product-save';
import { CategoryManager, OptionManager } from './Resources';
export function Products() {
  const { products, categories, canEdit, api, reload, notice, notify } =
    useCatalog();
  const session = useSession();
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [state, setState] = useState('all'),
    [editing, setEditing] = useState<Product | null | undefined>(),
    [categoriesOpen, setCategoriesOpen] = useState(false),
    [options, setOptions] = useState<Product | null>(null),
    [confirm, setConfirm] = useState<{
      product: Product;
      archive: boolean;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const access = {
    token: session.token,
    storeId: session.storeId,
    canEdit,
    onExpired: () => session.logout(true),
  };
  const shown = filterProducts(products, categories, query, category, state);
  async function change() {
    if (!confirm) return;
    setBusy(true);
    setError('');
    try {
      await api(
        '/products/' + confirm.product.id,
        confirm.archive ? 'DELETE' : 'PATCH',
        confirm.archive
          ? undefined
          : {
              status:
                confirm.product.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
            },
      );
      await reload();
      notify(confirm.archive ? '商品已归档，历史资料保留' : '商品状态已更新');
      setConfirm(null);
    } catch {
      setError('操作未完成，请刷新确认后重试');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">打理好每一道招牌</span>
          <h1>门店商品</h1>
          <p>管理菜单、售价与可选搭配，让顾客更容易找到喜欢的商品。</p>
        </div>
        <div className="actions">
          <Button
            onClick={() => setCategoriesOpen(true)}
            icon={<AppstoreOutlined />}
          >
            商品分类
          </Button>
          {canEdit && (
            <Button
              type="primary"
              size="large"
              icon={<PlusOutlined />}
              onClick={() => setEditing(null)}
            >
              新增商品
            </Button>
          )}
        </div>
      </div>
      {notice && (
        <Alert
          title={notice}
          type="success"
          showIcon
          closable
          onClose={() => notify('')}
        />
      )}
      {!canEdit && (
        <Alert type="info" title="当前账号仅可查看商品，修改请联系门店负责人" />
      )}
      <section className="panel catalog-panel">
        <Tabs
          activeKey={state}
          onChange={setState}
          items={[
            ['all', '全部商品'],
            ['active', '在售'],
            ['inactive', '已下架'],
            ['soldout', '售罄'],
          ].map(([key, label]) => ({
            key: key!,
            label: `${label} · ${products.filter((p) => key === 'all' || productState(p) === key).length}`,
          }))}
        />
        <div className="filters">
          <Input
            aria-label="搜索商品"
            placeholder="搜索商品名称、描述或分类"
            prefix={<SearchOutlined />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            allowClear
          />
          <Select
            aria-label="商品分类筛选"
            value={category}
            onChange={setCategory}
            options={[
              { value: '', label: '全部分类' },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <span className="muted">共 {shown.length} 个商品</span>
        </div>
        {shown.length ? (
          <div className="product-grid">
            {shown.map((p) => {
              const row = adaptProduct(p);
              const status = productState(p);
              const variants = p.variantRecords.filter(
                (v) => v.status === 'ACTIVE',
              );
              return (
                <article className="product-card" key={p.id}>
                  <ProductImage
                    image={p.imageUrl}
                    title={p.name}
                    access={access}
                  />
                  <div className="product-body">
                    <div className="product-title">
                      <h2>{p.name}</h2>
                      <Tag
                        color={
                          status === 'active'
                            ? 'green'
                            : status === 'soldout'
                              ? 'orange'
                              : 'default'
                        }
                      >
                        {status === 'active'
                          ? '已上架'
                          : status === 'soldout'
                            ? '已售罄'
                            : '已下架'}
                      </Tag>
                    </div>
                    <p className="muted">
                      {categories.find((c) => c.id === p.categoryId)?.name ??
                        '分类待确认'}
                    </p>
                    <p className="description">
                      {p.description || '暂未填写商品描述'}
                    </p>
                    <div className="price-row">
                      <strong>
                        {row.priceFen === null
                          ? '待设置售价'
                          : formatFen(row.priceFen) +
                            (row.multiplePrices ? ' 起' : '')}
                      </strong>
                      <span className="muted">
                        {variants.some((v) => v.unlimitedStock)
                          ? '不限库存'
                          : `库存 ${variants.reduce((sum, v) => sum + v.stockQuantity, 0)} 件`}
                      </span>
                    </div>
                    <div className="product-actions">
                      <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => setEditing(p)}
                      >
                        {canEdit ? '编辑商品' : '查看商品'}
                      </Button>
                      <Button type="text" onClick={() => setOptions(p)}>
                        规格 / 附加选项
                      </Button>
                      {canEdit && (
                        <>
                          <Button
                            type="text"
                            onClick={() =>
                              setConfirm({ product: p, archive: false })
                            }
                          >
                            {p.status === 'ACTIVE' ? '下架' : '上架'}
                          </Button>
                          <Button
                            type="text"
                            danger
                            onClick={() =>
                              setConfirm({ product: p, archive: true })
                            }
                          >
                            归档
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            description={
              products.length
                ? '没有符合筛选条件的商品'
                : '还没有商品，从添加第一款招牌开始'
            }
          >
            {canEdit && !products.length && (
              <Button type="primary" onClick={() => setEditing(null)}>
                新增商品
              </Button>
            )}
          </Empty>
        )}
      </section>
      {editing !== undefined && (
        <ProductEditor
          product={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
      {categoriesOpen && (
        <CategoryManager onClose={() => setCategoriesOpen(false)} />
      )}
      {options && (
        <OptionManager
          product={products.find((p) => p.id === options.id) ?? options}
          onClose={() => setOptions(null)}
        />
      )}
      <Modal
        title={confirm?.archive ? '确认归档商品' : '确认调整上架状态'}
        open={!!confirm}
        onCancel={() => !busy && setConfirm(null)}
        onOk={() => void change()}
        confirmLoading={busy}
        okText="确认"
        cancelText="取消"
      >
        <p>{confirm?.product.name}</p>
        <p>
          {confirm?.archive
            ? '归档后不再出现在正常商品列表，历史配方和成本资料仍然保留。'
            : '调整后会立即更新本店商品的上架状态。'}
        </p>
        {error && <Alert title={error} type="error" />}
      </Modal>
    </>
  );
}
function ProductEditor({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const { categories, canEdit, api, reload, notify } = useCatalog();
  const session = useSession();
  const [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(''),
    [image, setImage] = useState(product?.imageUrl ?? '');
  const [form] = Form.useForm();
  const active =
    product?.variantRecords.filter((v) => v.status === 'ACTIVE') ?? [];
  const initial: ProductDraft = {
    title: product?.name ?? '',
    category_id: product?.categoryId ?? '',
    description: product?.description ?? '',
    image: product?.imageUrl ?? '',
    available: product ? product.status === 'ACTIVE' : true,
    price:
      active.length === 1 ? formatFen(active[0]!.salePriceFen).slice(1) : '',
  };
  async function submit(values: ProductDraft) {
    if (!canEdit || uploading) return;
    setBusy(true);
    setError('');
    try {
      await saveProduct(
        api,
        { ...initial, ...values, image },
        product?.id,
        product ? initial : undefined,
      );
      await reload();
      notify(product ? '商品资料已保存' : '商品已创建，默认规格已自动建立');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请重试');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={product ? (canEdit ? '编辑商品' : '商品资料') : '新增商品'}
      open
      onCancel={() => !busy && !uploading && onClose()}
      footer={null}
      width={760}
      destroyOnHidden
      mask={{ closable: false }}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={initial}
        onFinish={submit}
        disabled={!canEdit || busy}
      >
        {!categories.length && (
          <Alert
            type="warning"
            title="请先创建商品分类"
            description="关闭此窗口，在商品分类中添加分类后再新增商品。"
          />
        )}
        <h3>必填资料</h3>
        <div className="form-grid">
          <Form.Item
            name="title"
            label="商品名称"
            rules={[
              { required: true, whitespace: true, message: '请输入商品名称' },
            ]}
          >
            <Input maxLength={160} placeholder="例如：招牌鲜果茶" />
          </Form.Item>
          <Form.Item
            name="category_id"
            label="商品分类"
            rules={[{ required: true, message: '请选择商品分类' }]}
          >
            <Select
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="选择分类"
            />
          </Form.Item>
        </div>
        {product && active.length !== 1 ? (
          <Alert
            type="info"
            title={
              active.length > 1
                ? '多规格商品，请到规格管理中修改价格'
                : '暂无有效规格，请到规格管理中添加或启用规格'
            }
          />
        ) : (
          <Form.Item
            name="price"
            label="售价（元）"
            rules={[{ required: true, message: '请输入售价' }]}
          >
            <Input inputMode="decimal" placeholder="18.80" prefix="¥" />
          </Form.Item>
        )}
        <h3>商品图片 · 推荐上传</h3>
        <ImageEditor
          image={image}
          onChange={setImage}
          onBusy={setUploading}
          access={{
            token: session.token,
            storeId: session.storeId,
            canEdit,
            onExpired: () => session.logout(true),
          }}
          disabled={!canEdit || busy}
        />
        <Collapse
          ghost
          items={[
            {
              key: 'more',
              label: '选填资料与上架设置',
              children: (
                <>
                  <Form.Item name="description" label="商品描述">
                    <Input.TextArea maxLength={4000} rows={3} />
                  </Form.Item>
                  <Form.Item
                    name="available"
                    label="上架状态"
                    valuePropName="checked"
                  >
                    <Switch
                      checkedChildren="已上架"
                      unCheckedChildren="已下架"
                    />
                  </Form.Item>
                </>
              ),
            },
          ]}
        />
        <p className="hint">
          系统自动：
          {product
            ? '保留商品所属门店与历史资料'
            : '创建默认规格、默认上架、不限库存'}
          。规格与附加选项可在保存后管理。
        </p>
        {error && <Alert type="error" title={error} showIcon />}
        <div className="modal-actions">
          <Button disabled={busy || uploading} onClick={onClose}>
            取消
          </Button>
          {canEdit && (
            <Button
              type="primary"
              htmlType="submit"
              loading={busy}
              disabled={uploading || !categories.length}
            >
              {uploading ? '请等待图片上传完成' : '保存商品'}
            </Button>
          )}
        </div>
      </Form>
    </Modal>
  );
}
