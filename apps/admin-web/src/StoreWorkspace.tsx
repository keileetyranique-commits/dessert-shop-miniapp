import { useEffect, useState, useRef } from 'react';
import { Editor, type Values } from './Editor';
import type {
  Store,
  Named,
  Product,
  Ingredient,
  Package,
  Purchase,
  Cost,
} from './admin-types';
import {
  named,
  options,
  text,
  number,
  status,
  unitOptions,
  cash,
  storeFields,
} from './admin-fields';
import { createClient } from './admin-client';
import { CostResult, RecipeEditor, PackagingEditor } from './CostEditors';
export function Workspace({
  token,
  storeId,
  role,
}: {
  token: string;
  storeId: string;
  role: string;
}) {
  const api = createClient(token, storeId),
    sensitive = ['OWNER', 'COST_MANAGER'].includes(role),
    catalogWrite = ['OWNER', 'MANAGER'].includes(role);
  const [tab, setTab] = useState('store'),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const [store, setStore] = useState<Store | null>(null),
    [categories, setCategories] = useState<(Named & { status: string })[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [ingredients, setIngredients] = useState<Ingredient[]>([]),
    [packs, setPacks] = useState<Package[]>([]),
    [purchases, setPurchases] = useState<Purchase[]>([]);
  const [modifiers, setModifiers] = useState<
    (Named & { costFen: number | null })[]
  >([]);
  const [clearingModifier, setClearingModifier] = useState<string | null>(null);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [productId, setProductId] = useState(''),
    [skuId, setSkuId] = useState(''),
    [categoryId, setCategoryId] = useState(''),
    [ingredientId, setIngredientId] = useState(''),
    [groupId, setGroupId] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [fulfillment, setFulfillment] = useState('PICKUP'),
    [itemsPerOrder, setItemsPerOrder] = useState('');
  const costRequest = useRef(0);
  useEffect(() => {
    costRequest.current++;
    setCost(null);
  }, [skuId, month, fulfillment, itemsPerOrder, revision]);
  const [fixed, setFixed] = useState<Values | null>(null),
    [allocation, setAllocation] = useState<Values | null>(null),
    [cost, setCost] = useState<Cost | null>(null);
  useEffect(() => {
    let active = true;
    setError('');
    const client = createClient(token, storeId);
    const load = async () => {
      const [s, c, p] = await Promise.all([
        client<Store>('/store'),
        client<(Named & { status: string })[]>('/categories'),
        client<Product[]>('/products'),
      ]);
      if (active) {
        setStore(s);
        setCategories(c);
        setProducts(p);
      }
      if (sensitive) {
        const [i, pk, pr, f, a, modifiers] = await Promise.all([
          client<Ingredient[]>('/costs/ingredients'),
          client<Package[]>('/costs/packaging'),
          client<Purchase[]>('/costs/purchases'),
          client<Values | null>('/costs/fixed/' + month),
          client<Values | null>('/costs/allocation/' + month),
          client<(Named & { costFen: number | null })[]>('/costs/modifiers'),
        ]);
        if (active) {
          setModifiers(modifiers);
          setIngredients(i);
          setPacks(pk);
          setPurchases(pr);
          setFixed(f);
          setAllocation(a);
        }
      }
    };
    load().catch((err) => {
      if (active) setError(err.message);
    });
    return () => {
      active = false;
    };
  }, [token, storeId, revision, month, sensitive]);
  async function save(path: string, method: string, body: unknown) {
    await api(path, method, body);
    setRevision((v) => v + 1);
    setCost(null);
  }
  const product = products.find((p) => p.id === productId),
    sku = product?.variantRecords.find((v) => v.id === skuId),
    group = product?.modifierGroupRecords.find((g) => g.id === groupId),
    ingredient = ingredients.find((i) => i.id === ingredientId);
  const skuFields = [
    text('name', '规格名称'),
    number('salePriceFen', '售价（分）'),
    status,
    { name: 'unlimitedStock', label: '无限库存', type: 'checkbox' as const },
    { name: 'soldOut', label: '标记售罄', type: 'checkbox' as const },
  ];
  const productFields = [
    text('name', '商品名称'),
    { name: 'categoryId', label: '分类', options: named(categories) },
    text('description', '描述'),
    { ...text('imageUrl', '图片 URL'), required: false },
    status,
  ];
  const chooseProduct = (
    <label>
      选择商品
      <select
        value={productId}
        onChange={(e) => {
          setProductId(e.target.value);
          setSkuId('');
          setGroupId('');
          setCost(null);
        }}
      >
        <option value="">请选择</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
  const chooseSku = (
    <label>
      选择 SKU
      <select
        value={skuId}
        onChange={(e) => {
          setSkuId(e.target.value);
          setCost(null);
        }}
      >
        <option value="">请选择</option>
        {product?.variantRecords.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name} · {cash(v.salePriceFen)}
          </option>
        ))}
      </select>
    </label>
  );
  const tabs = [
    ['store', '门店'],
    ...(catalogWrite
      ? [
          ['catalog', '商品与规格'],
          ['inventory', '库存'],
        ]
      : []),
    ...(sensitive
      ? [
          ['modifiers', '选项成本'],
          ['ingredients', '食材与采购'],
          ['recipe', '配方 BOM'],
          ['packaging', '包装'],
          ['fixed', '月固定成本'],
          ['cost', '成本计算'],
        ]
      : []),
  ];
  return (
    <div>
      {error && (
        <p role="alert">
          {error}{' '}
          <button onClick={() => setRevision((v) => v + 1)}>重试</button>
        </p>
      )}
      <nav aria-label="成本中心功能">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            onClick={() => setTab(key!)}
          >
            {label}
          </button>
        ))}
      </nav>
      {['catalog', 'inventory', 'recipe', 'packaging', 'cost'].includes(
        tab,
      ) && (
        <div className="selectors">
          {chooseProduct}
          {chooseSku}
        </div>
      )}
      {tab === 'store' &&
        store &&
        (role === 'OWNER' ? (
          <Editor
            key={store.id + revision}
            title="门店资料"
            fields={storeFields}
            initial={{ ...store }}
            onSave={(d) => save('/store', 'PATCH', d)}
          />
        ) : (
          <p>
            {store.name} · {store.address} · {store.businessHours}
          </p>
        ))}
      {tab === 'catalog' && catalogWrite && (
        <>
          <Editor
            title="分类"
            fields={[text('name', '分类名称'), status]}
            onSave={(d) => save('/categories', 'POST', d)}
          />
          <label>
            编辑分类
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">请选择</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {categoryId && (
            <Editor
              key={categoryId + revision}
              title="分类资料"
              initial={{ ...categories.find((c) => c.id === categoryId)! }}
              fields={[text('name', '分类名称'), status]}
              onSave={(d) => save('/categories/' + categoryId, 'PATCH', d)}
            />
          )}
          {categories.length > 0 ? (
            <Editor
              key={'new-product' + categories.length}
              title="商品"
              fields={productFields}
              onSave={(d) => save('/products', 'POST', d)}
            />
          ) : (
            <p>请先建立分类。</p>
          )}
          {product && (
            <>
              <Editor
                key={product.id + revision}
                title="商品资料"
                initial={{
                  name: product.name,
                  description: product.description,
                  imageUrl: product.imageUrl,
                  categoryId: product.categoryId,
                  status: product.status,
                }}
                fields={productFields}
                onSave={(d) => save('/products/' + product.id, 'PATCH', d)}
              />
              <Editor
                title="商品归档"
                fields={[
                  {
                    name: 'confirmed',
                    label: '确认归档当前商品（历史资料保留）',
                    type: 'checkbox',
                  },
                ]}
                onSave={async (d) => {
                  if (!d.confirmed) throw Error('请先确认');
                  await save('/products/' + product.id, 'DELETE', undefined);
                  setProductId('');
                  setSkuId('');
                }}
              />
              <Editor
                title="新规格"
                fields={[...skuFields, number('stockQuantity', '初始库存')]}
                onSave={(d) =>
                  save('/products/' + product.id + '/variants', 'POST', d)
                }
              />
              <Editor
                title="选项组"
                fields={[
                  text('name', '选项组名称'),
                  number('minSelections', '最少选择数量'),
                  number('maxSelections', '最多选择数量', 1),
                ]}
                onSave={(d) =>
                  save(
                    '/products/' + product.id + '/modifier-groups',
                    'POST',
                    d,
                  )
                }
              />
              <label>
                选项组
                <select
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                >
                  <option value="">请选择</option>
                  {product.modifierGroupRecords.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              {group && (
                <>
                  <Editor
                    title="附加选项"
                    fields={[
                      text('name', '选项名称'),
                      number('salePriceFen', '附加价格（分）'),
                      status,
                    ]}
                    onSave={(d) =>
                      save(
                        '/modifier-groups/' + group.id + '/modifiers',
                        'POST',
                        d,
                      )
                    }
                  />
                  {group.modifierRecords.map((m) => (
                    <details key={m.id}>
                      <summary>
                        {m.name} · {cash(m.salePriceFen)}
                      </summary>
                      <Editor
                        title="选项资料"
                        initial={{ ...m }}
                        fields={[
                          text('name', '选项名称'),
                          number('salePriceFen', '附加价格（分）'),
                          status,
                        ]}
                        onSave={(d) => save('/modifiers/' + m.id, 'PATCH', d)}
                      />
                    </details>
                  ))}
                </>
              )}
            </>
          )}
          {sku && (
            <>
              <Editor
                key={sku.id + revision}
                title="规格资料"
                initial={{ ...sku }}
                fields={skuFields}
                onSave={(d) => save('/variants/' + sku.id, 'PATCH', d)}
              />
              <Editor
                title="归档 SKU"
                fields={[
                  {
                    name: 'confirmed',
                    label: '确认归档当前 SKU（历史资料保留）',
                    type: 'checkbox',
                  },
                ]}
                onSave={async (d) => {
                  if (!d.confirmed) throw Error('请先确认');
                  await save('/variants/' + sku.id, 'DELETE', undefined);
                  setSkuId('');
                }}
              />
            </>
          )}
        </>
      )}
      {tab === 'inventory' &&
        catalogWrite &&
        (sku ? (
          <>
            <p>
              当前库存：{sku.stockQuantity}；
              {sku.unlimitedStock ? '无限库存' : '有限库存'}；
              {sku.soldOut || (!sku.unlimitedStock && sku.stockQuantity === 0)
                ? '已售罄'
                : '可售'}
            </p>
            <Editor
              title="库存调整"
              fields={[
                {
                  ...number('delta', '增减数量（减少请输入负数）'),
                  min: -2147483647,
                },
                text('reason', '调整原因'),
              ]}
              onSave={(d) => save('/variants/' + sku.id + '/stock', 'POST', d)}
            />
            <Editor
              key={sku.id + revision}
              title="库存模式"
              initial={{ ...sku }}
              fields={skuFields.slice(2)}
              onSave={(d) => save('/variants/' + sku.id, 'PATCH', d)}
            />
          </>
        ) : (
          <p>请选择 SKU。</p>
        ))}
      {tab === 'modifiers' && sensitive && (
        <section>
          <h3>通用选项成本</h3>
          <p>维护每次选择的成本；未配置不等于零成本。选项由商品管理员创建。</p>
          {modifiers.map((m) => (
            <div key={m.id + ':' + revision + ':' + String(m.costFen)}>
              <Editor
                title={
                  m.name +
                  ' · ' +
                  (m.costFen === null ? '未配置' : cash(m.costFen))
                }
                initial={m.costFen === null ? {} : { costFen: m.costFen }}
                fields={[{ ...number('costFen', '选项成本（分）'), value: '' }]}
                onSave={(d) => save('/costs/modifiers/' + m.id, 'PATCH', d)}
              />
              <button
                disabled={m.costFen === null || clearingModifier !== null}
                onClick={async () => {
                  setClearingModifier(m.id);
                  setError('');
                  try {
                    await save('/costs/modifiers/' + m.id, 'PATCH', {
                      costFen: null,
                    });
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setClearingModifier(null);
                  }
                }}
              >
                清除成本 / 标记为未配置
              </button>
            </div>
          ))}
        </section>
      )}
      {tab === 'ingredients' && (
        <>
          <Editor
            title="食材"
            fields={[
              text('name', '食材名称'),
              {
                name: 'baseUnit',
                label: '基础单位',
                options: options(['g', 'ml', 'each']),
              },
              number('lossRateBps', '损耗率（bps，100 = 1%）'),
              status,
            ]}
            onSave={(d) => save('/costs/ingredients', 'POST', d)}
          />
          <label>
            食材
            <select
              value={ingredientId}
              onChange={(e) => setIngredientId(e.target.value)}
            >
              <option value="">请选择</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}（{i.baseUnit}）
                </option>
              ))}
            </select>
          </label>
          {ingredient && (
            <Editor
              key={ingredient.id + revision}
              title="食材资料"
              initial={{ ...ingredient }}
              fields={[
                text('name', '食材名称'),
                number('lossRateBps', '损耗率（bps）'),
                status,
              ]}
              onSave={(d) =>
                save('/costs/ingredients/' + ingredient.id, 'PATCH', d)
              }
            />
          )}
          {ingredients.length > 0 && (
            <Editor
              key={ingredients.length}
              title="采购记录"
              fields={[
                {
                  name: 'ingredientId',
                  label: '采购食材',
                  options: named(ingredients),
                },
                text('supplier', '供应商'),
                text('quantity', '采购数量（小数最多6位）', '1'),
                { name: 'unit', label: '采购单位', options: unitOptions },
                number('totalCostFen', '采购总金额（分）'),
                text(
                  'purchasedAt',
                  '采购时间（含时区 ISO）',
                  new Date().toISOString(),
                ),
              ]}
              onSave={(d) => save('/costs/purchases', 'POST', d)}
            />
          )}
          <h3>采购历史（保留旧价）</h3>
          <table>
            <thead>
              <tr>
                <th>食材</th>
                <th>数量</th>
                <th>总额</th>
                <th>采购时间</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td>
                    {ingredients.find((i) => i.id === p.ingredientId)?.name}
                  </td>
                  <td>
                    {p.quantity} {p.unit}
                  </td>
                  <td>{cash(p.totalCostFen)}</td>
                  <td>{new Date(p.purchasedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {tab === 'recipe' &&
        (sku ? (
          <RecipeEditor
            key={sku.id}
            api={api}
            sku={sku}
            ingredients={ingredients}
            changed={() => {
              setRevision((v) => v + 1);
              setCost(null);
            }}
          />
        ) : (
          <p>请选择 SKU。</p>
        ))}
      {tab === 'packaging' && (
        <>
          <Editor
            title="包装项目"
            fields={[
              text('name', '包装名称'),
              number('unitCostFen', '单件成本（分）'),
              {
                name: 'scope',
                label: '用途范围',
                options: [
                  { value: 'SKU', label: 'SKU 包装' },
                  { value: 'ORDER', label: '整单公共包装（预留）' },
                ],
              },
              status,
            ]}
            onSave={(d) => save('/costs/packaging', 'POST', d)}
          />
          {packs.map((p) => (
            <details key={p.id}>
              <summary>
                {p.name} · {cash(p.unitCostFen)} · {p.scope}
              </summary>
              <Editor
                title="包装资料"
                initial={{ ...p }}
                fields={[
                  text('name', '包装名称'),
                  number('unitCostFen', '单件成本（分）'),
                  status,
                ]}
                onSave={(d) => save('/costs/packaging/' + p.id, 'PATCH', d)}
              />
            </details>
          ))}
          {sku ? (
            <PackagingEditor
              key={sku.id}
              api={api}
              sku={sku}
              packs={packs.filter((p) => p.scope === 'SKU')}
              changed={() => {
                setRevision((v) => v + 1);
                setCost(null);
              }}
            />
          ) : (
            <p>选择 SKU 后配置履约包装。</p>
          )}
        </>
      )}
      {['fixed', 'cost'].includes(tab) && (
        <label>
          成本月份
          <input
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setCost(null);
            }}
          />
        </label>
      )}
      {tab === 'fixed' && (
        <>
          <p>
            固定工资计入固定成本；按制作时间增加的人工才填可变人工费率，避免重复计入。
          </p>
          <Editor
            key={month + 'fixed' + (fixed?.id ?? 'empty') + revision}
            title="月固定成本"
            initial={fixed ?? {}}
            fields={[
              number('rentFen', '房租（分）'),
              number('utilitiesFen', '水电（分）'),
              number('payrollFen', '固定人工（分）'),
              number('propertyFeeFen', '物业（分）'),
              number('depreciationFen', '折旧（分）'),
              number('softwareFen', '软件（分）'),
              number('otherFen', '其他（分）'),
            ]}
            onSave={(d) => save('/costs/fixed/' + month, 'PUT', d)}
          />
          <Editor
            key={month + 'allocation' + (allocation?.id ?? 'empty') + revision}
            title="分摊规则"
            initial={allocation ?? {}}
            fields={[
              {
                name: 'method',
                label: '分摊方式',
                options: [
                  { value: 'ITEM', label: '按商品份数' },
                  { value: 'ORDER', label: '按订单（计算时需每单份数）' },
                ],
              },
              number('expectedMonthlyItems', '预计月商品份数', 1),
              number('expectedMonthlyOrders', '预计月订单数', 1),
              number('laborFenPerMinute', '可变人工每分钟成本（分）'),
            ]}
            onSave={(d) => save('/costs/allocation/' + month, 'PUT', d)}
          />
        </>
      )}
      {tab === 'cost' && (
        <>
          <label>
            履约方式
            <select
              value={fulfillment}
              onChange={(e) => {
                setFulfillment(e.target.value);
                setCost(null);
              }}
            >
              {['PICKUP', 'DELIVERY', 'DINE_IN'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            每单份数（按订单分摊时必填）
            <input
              type="number"
              min="1"
              step="1"
              value={itemsPerOrder}
              onChange={(e) => {
                setItemsPerOrder(e.target.value);
                setCost(null);
              }}
            />
          </label>
          <button
            disabled={!sku}
            onClick={async () => {
              try {
                const requestId = ++costRequest.current;
                setError('');
                const result = await api<Cost>(
                  '/costs/variants/' +
                    skuId +
                    '/cost?' +
                    new URLSearchParams({
                      month,
                      fulfillment,
                      ...(itemsPerOrder ? { itemsPerOrder } : {}),
                    }),
                );
                if (requestId === costRequest.current) setCost(result);
              } catch (err) {
                setError((err as Error).message);
                setCost(null);
              }
            }}
          >
            计算当前单份成本
          </button>
          <button
            disabled={!sku || !cost || savingSnapshot}
            onClick={async () => {
              setSavingSnapshot(true);
              const requestId = ++costRequest.current;
              try {
                setError('');
                const result = await api<Cost>(
                  '/costs/variants/' + skuId + '/cost/snapshots',
                  'POST',
                  {
                    month,
                    fulfillment,
                    ...(itemsPerOrder ? { itemsPerOrder } : {}),
                  },
                );
                if (requestId === costRequest.current) setCost(result);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setSavingSnapshot(false);
              }
            }}
          >
            保存成本快照
          </button>
          <p>预览不会保存历史；保存快照会使用当前资料重新计算。</p>
          {cost && <CostResult cost={cost} />}
        </>
      )}
    </div>
  );
}
