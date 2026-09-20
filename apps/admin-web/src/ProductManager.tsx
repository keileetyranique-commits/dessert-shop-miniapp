import { useState } from 'react';
import { Table, Input, Tag, Button, Modal } from 'antd';
import { Editor } from './Editor';
import type { Client, Named, Product } from './admin-types';
import { text, number, named, cash } from './admin-fields';
import { ProductImage } from './ImageUpload';
export function ProductManager({
  products,
  categories,
  api,
  changed,
  loading,
}: {
  products: Product[];
  categories: Named[];
  api: Client;
  changed: () => void;
  loading: boolean;
}) {
  const [search, setSearch] = useState(''),
    [filter, setFilter] = useState(''),
    [selected, setSelected] = useState<Product | 'new' | null>(null);
  const product = selected && selected !== 'new' ? selected : null;
  return (
    <section>
      <div className="toolbar">
        <h2>商品</h2>
        <Button type="primary" onClick={() => setSelected('new')}>
          新增商品
        </Button>
      </div>
      <div className="selectors">
        <label>
          搜索商品
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="输入商品名称"
          />
        </label>
        <label>
          筛选分类
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">全部分类</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Table<Product>
        rowKey="id"
        loading={loading}
        dataSource={products.filter(
          (p) =>
            p.name.includes(search) && (!filter || p.categoryId === filter),
        )}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 540 }}
        locale={{ emptyText: '还没有商品，点击“新增商品”开始' }}
        columns={[
          {
            title: '图片',
            render: (_, p) => <ProductImage value={p.imageUrl} />,
          },
          { title: '商品', dataIndex: 'name' },
          {
            title: '售价',
            render: (_, p) =>
              p.variantRecords.length
                ? cash(
                    Math.min(...p.variantRecords.map((v) => v.salePriceFen)),
                  ) + (p.variantRecords.length > 1 ? ' 起' : '')
                : '待设置',
          },
          {
            title: '状态',
            render: (_, p) => (
              <Tag>{p.status === 'ACTIVE' ? '已上架' : '已下架'}</Tag>
            ),
          },
          {
            title: '操作',
            render: (_, p) => (
              <Button onClick={() => setSelected(p)}>编辑商品</Button>
            ),
          },
        ]}
      />
      <details>
        <summary>管理分类</summary>
        <Editor
          title="分类"
          fields={[text('name', '分类名称')]}
          onSave={async (d) => {
            await api('/categories', 'POST', d);
            changed();
          }}
        />
      </details>
      <Modal
        title={product ? '编辑商品' : '新增商品'}
        open={selected !== null}
        footer={null}
        onCancel={() => setSelected(null)}
        destroyOnHidden
      >
        {categories.length === 0 ? (
          <p>请先关闭此窗口，在“管理分类”中创建分类。</p>
        ) : (
          <Editor
            key={product?.id ?? 'new'}
            title="商品"
            automatic={
              product
                ? '使用本店图片，价格按元填写'
                : '已上架；默认规格；不限库存（可在库存页调整）'
            }
            initial={
              product
                ? {
                    name: product.name,
                    categoryId: product.categoryId,
                    imageUrl: product.imageUrl,
                    description: product.description,
                  }
                : {}
            }
            fields={[
              text('name', '商品名称'),
              { name: 'categoryId', label: '分类', options: named(categories) },
              ...(!product ? [number('salePriceFen', '售价（分）')] : []),
              {
                name: 'imageUrl',
                label: '商品图片',
                type: 'image',
                required: false,
              },
              { ...text('description', '商品介绍'), required: false },
            ]}
            onSave={async (d) => {
              await api(
                product ? '/products/' + product.id : '/products/simple',
                product ? 'PATCH' : 'POST',
                d,
              );
              changed();
              setSelected(null);
            }}
          />
        )}
        {product?.variantRecords.map((v) => (
          <Editor
            key={v.id}
            title={
              product.variantRecords.length === 1 ? '售价' : v.name + '售价'
            }
            fields={[number('salePriceFen', '售价（分）')]}
            initial={{ salePriceFen: v.salePriceFen }}
            onSave={async (d) => {
              await api('/variants/' + v.id, 'PATCH', d);
              changed();
              setSelected(null);
            }}
          />
        ))}
      </Modal>
    </section>
  );
}
