import { useEffect, useState, useId } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Select,
  Tabs,
} from 'antd';
import { Link } from 'react-router-dom';
import { useCatalog } from './Data';
import { useSession } from './Session';
import { yuanToFen } from './product-save';
import type { Ingredient, Package } from '../admin-types';
import { AdminRequestError } from '../admin-client';
type Values = Record<string, unknown>;
export function CostSetup() {
  const s = useSession();
  if (!['OWNER', 'COST_MANAGER'].includes(s.identity.role))
    return <Alert title="仅老板和成本负责人可维护成本资料" type="info" />;
  return <CostForms key={s.storeId} />;
}
function CostForms() {
  const { api, products } = useCatalog();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]),
    [packs, setPacks] = useState<Package[]>([]),
    [modifiers, setModifiers] = useState<
      { id: string; name: string; costFen: number | null }[]
    >([]),
    [error, setError] = useState('');
  async function load() {
    const [i, p, m] = await Promise.all([
      api<Ingredient[]>('/costs/ingredients'),
      api<Package[]>('/costs/packaging'),
      api<typeof modifiers>('/costs/modifiers'),
    ]);
    setIngredients(i);
    setPacks(p);
    setModifiers(m);
  }
  useEffect(() => {
    void load().catch(() => setError('成本资料暂时无法读取，请刷新重试'));
  }, [api]);
  const variants = products.flatMap((p) =>
    p.variantRecords.map((v) => ({
      value: v.id,
      label: `${p.name} / ${v.name}`,
    })),
  );
  const selector = (
    name: string | (string | number)[],
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <Form.Item
      name={name}
      label={label}
      rules={[{ required: true, message: '请选择' + label }]}
    >
      <Select options={options} />
    </Form.Item>
  );
  const amount = (name: string | (string | number)[], label: string) => (
    <Form.Item
      name={name}
      label={label + '（元）· 必填，没有请填 0'}
      rules={[
        { required: true },
        {
          validator: (_, v) => {
            try {
              yuanToFen(String(v));
              return Promise.resolve();
            } catch {
              return Promise.reject(Error('请输入有效金额，最多两位小数'));
            }
          },
        },
      ]}
    >
      <Input inputMode="decimal" />
    </Form.Item>
  );
  const text = (name: string, label: string) => (
    <Form.Item
      name={name}
      label={label}
      rules={[{ required: true, whitespace: true }]}
    >
      <Input />
    </Form.Item>
  );
  const number = (name: string, label: string, min = 0) => (
    <Form.Item name={name} label={label} rules={[{ required: true }]}>
      <InputNumber min={min} precision={0} />
    </Form.Item>
  );
  const units = [
    { value: 'g', label: '克' },
    { value: 'kg', label: '公斤' },
    { value: 'ml', label: '毫升' },
    { value: 'L', label: '升' },
    { value: 'each', label: '个' },
  ];
  const monthly = (
    <Form.Item
      name="month"
      label="成本月份 · 必填"
      rules={[{ required: true }]}
    >
      <Input type="month" />
    </Form.Item>
  );
  const wrap = (
    children: React.ReactNode,
    save: (v: Values) => Promise<unknown>,
    emptyConfirmation?: string,
  ) => (
    <CostForm
      emptyConfirmation={emptyConfirmation}
      save={async (v) => {
        await save(v);
        await load();
      }}
    >
      {children}
    </CostForm>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>成本资料</h1>
          <p>复用现有成本中心。金额填写元，系统精确换算；明确零成本请填 0。</p>
        </div>
        <Link to="/admin/analysis">返回定价与利润保护</Link>
      </div>
      {error && <Alert title={error} type="error" />}
      <section className="panel">
        <Tabs
          items={[
            {
              key: 'ingredients',
              label: '原料与采购',
              children: (
                <div className="pricing-grid">
                  {wrap(
                    <>
                      <h3>新增原料 · 必填</h3>
                      {text('name', '原料名称')}
                      {selector(
                        'baseUnit',
                        '基础单位',
                        units.filter((u) => !['kg', 'L'].includes(u.value)),
                      )}
                      <Form.Item name="loss" label="损耗（%）· 选填，默认 0">
                        <Input />
                      </Form.Item>
                    </>,
                    (v) =>
                      api('/costs/ingredients', 'POST', {
                        name: v.name,
                        baseUnit: v.baseUnit,
                        lossRateBps: yuanToFen(String(v.loss || '0')),
                      }),
                  )}
                  {wrap(
                    <>
                      <h3>记录采购 · 必填</h3>
                      {selector(
                        'ingredientId',
                        '原料',
                        ingredients.map((i) => ({
                          value: i.id,
                          label: i.name,
                        })),
                      )}
                      {text('supplier', '供应商')}
                      {text('quantity', '采购数量')}
                      {selector('unit', '采购单位', units)}
                      {amount('cost', '总采购金额')}
                      <p>
                        系统自动：采购时间记录为现在；新增历史记录，不覆盖旧采购价。
                      </p>
                    </>,
                    (v) =>
                      api('/costs/purchases', 'POST', {
                        ingredientId: v.ingredientId,
                        supplier: v.supplier,
                        quantity: v.quantity,
                        unit: v.unit,
                        totalCostFen: yuanToFen(String(v.cost)),
                        purchasedAt: new Date().toISOString(),
                      }),
                  )}
                </div>
              ),
            },
            {
              key: 'recipe',
              label: '商品配方',
              children: wrap(
                <>
                  <Alert
                    type="info"
                    title="保存为新的配方版本并启用，不会删除旧版本。请填写完整原料清单；确实无需原料时，必须在下方明确确认。"
                  />
                  {selector('variantId', '商品规格', variants)}
                  {number('yieldQuantity', '此配方产出份数 · 必填', 1)}
                  {number('laborSeconds', '整批制作时长（秒）· 必填')}
                  {amount('other', '整批其他可变成本')}
                  <Form.List name="items">
                    {(fields, { add, remove }) => (
                      <>
                        {fields.map((f) => (
                          <div className="pricing-item" key={f.key}>
                            {selector(
                              [f.name, 'ingredientId'],
                              '原料',
                              ingredients.map((i) => ({
                                value: i.id,
                                label: i.name,
                              })),
                            )}
                            <Form.Item
                              name={[f.name, 'quantity']}
                              label="用量"
                              rules={[{ required: true }]}
                            >
                              <Input />
                            </Form.Item>
                            {selector([f.name, 'unit'], '用量单位', units)}
                            <Button onClick={() => remove(f.name)}>
                              移除此行
                            </Button>
                          </div>
                        ))}
                        <Button onClick={() => add()}>添加原料</Button>
                      </>
                    )}
                  </Form.List>
                </>,
                (v) =>
                  api(`/costs/variants/${v.variantId}/recipe`, 'PUT', {
                    yieldQuantity: v.yieldQuantity,
                    laborSeconds: v.laborSeconds,
                    otherVariableCostFen: yuanToFen(String(v.other)),
                    items: v.items ?? [],
                    noIngredientsConfirmed: v.emptyConfirmed === true,
                  }),
                '我确认此配方确实无需原料',
              ),
            },
            {
              key: 'packaging',
              label: '包装',
              children: (
                <div className="pricing-grid">
                  {wrap(
                    <>
                      <h3>新增包装</h3>
                      {text('name', '包装名称')}
                      {amount('cost', '每个包装成本')}
                      {selector('scope', '使用范围', [
                        { value: 'SKU', label: '每份商品' },
                        { value: 'ORDER', label: '整单公共包装' },
                      ])}
                    </>,
                    (v) =>
                      api('/costs/packaging', 'POST', {
                        name: v.name,
                        unitCostFen: yuanToFen(String(v.cost)),
                        scope: v.scope,
                      }),
                  )}
                  {wrap(
                    <>
                      <h3>设置每份商品包装</h3>
                      {selector('variantId', '商品规格', variants)}
                      {selector('fulfillment', '履约方式', [
                        { value: 'PICKUP', label: '到店自取' },
                        { value: 'DINE_IN', label: '堂食' },
                        { value: 'DELIVERY', label: '配送' },
                      ])}
                      <Form.List name="items">
                        {(fields, { add, remove }) => (
                          <>
                            {fields.map((f) => (
                              <div key={f.key}>
                                {selector(
                                  [f.name, 'packagingItemId'],
                                  '包装',
                                  packs
                                    .filter((p) => p.scope === 'SKU')
                                    .map((p) => ({
                                      value: p.id,
                                      label: p.name,
                                    })),
                                )}
                                <Form.Item
                                  name={[f.name, 'quantity']}
                                  label="每份使用个数"
                                  rules={[{ required: true }]}
                                >
                                  <InputNumber min={1} precision={0} />
                                </Form.Item>
                                <Button onClick={() => remove(f.name)}>
                                  移除此行
                                </Button>
                              </div>
                            ))}
                            <Button onClick={() => add({ quantity: 1 })}>
                              添加包装
                            </Button>
                          </>
                        )}
                      </Form.List>
                      <p>
                        保存会替换当前清单。请添加所需包装；确实无需包装时，必须在下方明确确认。
                      </p>
                    </>,
                    (v) =>
                      api(`/costs/variants/${v.variantId}/packaging`, 'PUT', {
                        fulfillment: v.fulfillment,
                        items: v.items ?? [],
                        noPackagingConfirmed: v.emptyConfirmed === true,
                      }),
                    '我确认此商品在所选履约方式下确实无需包装',
                  )}
                </div>
              ),
            },
            {
              key: 'monthly',
              label: '固定成本与人工',
              children: (
                <div className="pricing-grid">
                  {wrap(
                    <>
                      <h3>月固定费用 · 完整填写</h3>
                      {monthly}
                      {[
                        ['rentFen', '房租'],
                        ['utilitiesFen', '水电'],
                        ['payrollFen', '固定人工'],
                        ['propertyFeeFen', '物业'],
                        ['depreciationFen', '折旧'],
                        ['softwareFen', '系统服务'],
                        ['otherFen', '其他'],
                      ].map(([k, label]) => (
                        <div key={k}>{amount(k!, label!)}</div>
                      ))}
                    </>,
                    (v) =>
                      api(
                        '/costs/fixed/' + v.month,
                        'PUT',
                        Object.fromEntries(
                          [
                            'rentFen',
                            'utilitiesFen',
                            'payrollFen',
                            'propertyFeeFen',
                            'depreciationFen',
                            'softwareFen',
                            'otherFen',
                          ].map((k) => [k, yuanToFen(String(v[k]))]),
                        ),
                      ),
                  )}
                  {wrap(
                    <>
                      <h3>分摊与可变人工 · 完整填写</h3>
                      {monthly}
                      {selector('method', '分摊方式', [
                        { value: 'ITEM', label: '按商品份数' },
                        { value: 'ORDER', label: '按订单数' },
                      ])}
                      {number('expectedMonthlyItems', '预计月销量（份）', 1)}
                      {number('expectedMonthlyOrders', '预计月订单数', 1)}
                      {amount('labor', '每分钟可变人工成本')}
                      <p>
                        固定工资已计入月费用；这里仅填临时或按单增加的人工，避免重复计费。
                      </p>
                    </>,
                    (v) =>
                      api('/costs/allocation/' + v.month, 'PUT', {
                        method: v.method,
                        expectedMonthlyItems: v.expectedMonthlyItems,
                        expectedMonthlyOrders: v.expectedMonthlyOrders,
                        laborFenPerMinute: yuanToFen(String(v.labor)),
                      }),
                  )}
                </div>
              ),
            },
            {
              key: 'modifiers',
              label: '附加选项成本',
              children: wrap(
                <>
                  {selector(
                    'modifierId',
                    '附加选项',
                    modifiers.map((m) => ({
                      value: m.id,
                      label: `${m.name} · ${m.costFen === null ? '未配置' : '已配置'}`,
                    })),
                  )}
                  {amount('cost', '每次选择增加的成本')}
                </>,
                (v) =>
                  api('/costs/modifiers/' + v.modifierId, 'PATCH', {
                    costFen: yuanToFen(String(v.cost)),
                  }),
              ),
            },
          ]}
        />
      </section>
    </>
  );
}
function CostForm({
  children,
  save,
  emptyConfirmation,
}: {
  children: React.ReactNode;
  save: (v: Values) => Promise<unknown>;
  emptyConfirmation?: string;
}) {
  const formName = useId();
  const [form] = Form.useForm();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [failed, setFailed] = useState(false);
  return (
    <Form
      form={form}
      name={formName}
      layout="vertical"
      disabled={busy}
      onValuesChange={(changed) => {
        setMessage('');
        if (emptyConfirmation && !Object.hasOwn(changed, 'emptyConfirmed'))
          form.setFieldValue('emptyConfirmed', false);
      }}
      initialValues={{
        month: new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
        }).format(new Date()),
      }}
      onFinish={async (v) => {
        setBusy(true);
        setMessage('');
        try {
          await save(v);
          form.setFieldValue('emptyConfirmed', false);
          setFailed(false);
          setMessage('已保存成本资料，请返回重新计算利润');
        } catch (e) {
          setFailed(true);
          setMessage(
            e instanceof AdminRequestError
              ? e.message
              : '未能保存，请检查金额、单位和必填资料',
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {emptyConfirmation && (
        <Form.Item noStyle shouldUpdate>
          {() =>
            !(form.getFieldValue('items') ?? []).length && (
              <Form.Item
                name="emptyConfirmed"
                valuePropName="checked"
                rules={[
                  {
                    validator: (_, value) =>
                      value === true
                        ? Promise.resolve()
                        : Promise.reject(
                            Error('清单为空，请添加项目或明确确认无需使用'),
                          ),
                  },
                ]}
              >
                <Checkbox>{emptyConfirmation}</Checkbox>
              </Form.Item>
            )
          }
        </Form.Item>
      )}
      {message && <Alert type={failed ? 'error' : 'success'} title={message} />}
      <Button htmlType="submit" type="primary" loading={busy}>
        保存成本资料
      </Button>
    </Form>
  );
}
