import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Collapse,
  Form,
  Input,
  InputNumber,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd';
import { useCatalog } from './Data';
import { useSession } from './Session';
import {
  actionLabels,
  orderActions,
  orderLabels,
  orderMoney,
  type OrderView,
} from './Orders';
import { yuanToFen } from './product-save';
import { fen, formatFen } from '@platform/shared';
interface MenuProduct {
  id: string;
  name: string;
  variantRecords: { id: string; name: string; salePriceFen: number }[];
  modifierGroupRecords: {
    id: string;
    name: string;
    minSelections: number;
    maxSelections: number;
    modifierRecords: { id: string; name: string; salePriceFen: number }[];
  }[];
}
interface CartLine {
  variantId: string;
  quantity: number;
  modifierIds: string[];
}
interface Preview {
  previewId: string;
  decision: string;
  message: string;
  payableFen: number;
  requiredTopupFen: number | null;
  goodsFen: number;
  merchantDiscountFen: number;
  platformDiscountFen: number;
  customerDeliveryFeeFen: number;
  packagingRevenueFen: number;
}
interface Terms {
  packagingRevenueFen: number;
  orderPackaging: { packagingItemId: string; quantity: number }[];
  customerDeliveryFeeFen: number;
  deliverySubsidyFen: number;
  merchantDiscountFen: number;
  platformDiscountFen: number;
  discountBps: number;
  promotion: { thresholdFen: number; discountFen: number } | null;
}
const emptyTerms: Terms = {
  packagingRevenueFen: 0,
  orderPackaging: [],
  customerDeliveryFeeFen: 0,
  deliverySubsidyFen: 0,
  merchantDiscountFen: 0,
  platformDiscountFen: 0,
  discountBps: 0,
  promotion: null,
};
const amountFields = [
  ['packagingRevenueFen', '顾客包装费'],
  ['customerDeliveryFeeFen', '顾客配送费'],
  ['deliverySubsidyFen', '商家配送优惠'],
  ['merchantDiscountFen', '商家优惠券'],
  ['platformDiscountFen', '平台承担优惠券'],
] as const;

export function OrderTestCenter() {
  const { api, canEdit } = useCatalog();
  const session = useSession();
  const [menu, setMenu] = useState<MenuProduct[]>([]),
    [cart, setCart] = useState<CartLine[]>([]);
  const [variant, setVariant] = useState(''),
    [quantity, setQuantity] = useState(1),
    [modifiers, setModifiers] = useState<string[]>([]);
  const [mode, setMode] = useState('PICKUP'),
    [distance, setDistance] = useState(3000),
    [preview, setPreview] = useState<Preview | null>(null),
    [consent, setConsent] = useState(false);
  const [order, setOrder] = useState<OrderView | null>(null),
    [orders, setOrders] = useState<OrderView[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [results, setResults] = useState<string[]>([]);
  const [terms, setTerms] = useState<Terms>(emptyTerms),
    [form] = Form.useForm();
  const [packaging, setPackaging] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [createKey, setCreateKey] = useState(() => crypto.randomUUID());
  const product = menu.find((p) =>
    p.variantRecords.some((v) => v.id === variant),
  );
  const variants = menu.flatMap((p) =>
    p.variantRecords.map((v) => ({
      value: v.id,
      label: `${p.name} · ${v.name} · ${orderMoney(v.salePriceFen)}`,
    })),
  );
  function note(text: string) {
    setResults((old) => [text, ...old].slice(0, 20));
  }
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : '测试未完成，请稍后重试');
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const list = await api<{ items: OrderView[] }>('/orders?page=1');
    setOrders(list.items);
  }
  useEffect(() => {
    let active = true;
    if (!canEdit) return;
    Promise.all([
      api<MenuProduct[]>('/orders/menu'),
      api<{ terms: Terms; autoAccept: boolean }>('/orders/settings'),
      api<{ items: OrderView[] }>('/orders?page=1'),
      api<{ id: string; name: string }[]>('/orders/packaging'),
    ])
      .then(([products, settings, list, materials]) => {
        if (!active) return;
        setMenu(products);
        setOrders(list.items);
        setTerms(settings.terms);
        setPackaging(materials);
        if (session.identity.role === 'OWNER')
          form.setFieldsValue({
            orderPackaging: settings.terms.orderPackaging,
            promotionThreshold: formatFen(
              fen(settings.terms.promotion?.thresholdFen ?? 0),
            ),
            promotionDiscount: formatFen(
              fen(settings.terms.promotion?.discountFen ?? 0),
            ),
            autoAccept: settings.autoAccept,
            ...Object.fromEntries(
              amountFields.map(([key]) => [
                key,
                formatFen(fen(settings.terms[key])),
              ]),
            ),
          });
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : '测试功能暂不可用');
      });
    return () => {
      active = false;
    };
  }, [api, canEdit, form, session.identity.role]);
  function invalidate() {
    setPreview(null);
    setConsent(false);
    setCreateKey(crypto.randomUUID());
  }
  async function calculate() {
    let quoteId: string | undefined;
    if (mode === 'DELIVERY')
      quoteId = (
        await api<{ id: string }>('/order-test/quotes', 'POST', {
          distanceMeters: distance,
        })
      ).id;
    const value = await api<Preview>('/orders/preview', 'POST', {
      fulfillment: mode,
      items: cart,
      ...(quoteId ? { quoteId } : {}),
    });
    setPreview(value);
    setConsent(false);
    setCreateKey(crypto.randomUUID());
    note('结算预览已重新计算：' + value.message);
  }
  async function create(key = createKey) {
    if (!preview) throw Error('请先计算结算预览');
    const value = await api<OrderView>('/orders', 'POST', {
      previewId: preview.previewId,
      idempotencyKey: key,
      acceptTopup: consent,
    });
    setOrder(value);
    note(
      `已创建测试订单 ${value.id.slice(-8)}，${orderLabels[value.orderStatus]}`,
    );
    await refresh();
    return value;
  }
  async function action(action: string, key = crypto.randomUUID()) {
    if (!order) throw Error('请先选择测试订单');
    const value = await api<OrderView>(`/orders/${order.id}/actions`, 'POST', {
      action,
      idempotencyKey: key,
    });
    setOrder(value);
    note(`${actionLabels[action]}：${orderLabels[value.orderStatus]}`);
    await refresh();
  }
  if (!canEdit)
    return <Alert type="warning" title="只有老板和店长可使用授权测试入口" />;
  const selectedOrder = (
    <Select
      aria-label="选择测试订单"
      placeholder="选择当前门店测试订单"
      style={{ minWidth: 300 }}
      value={order?.id}
      options={orders.map((o) => ({
        value: o.id,
        label: `${o.id.slice(-8)} · ${orderLabels[o.orderStatus]}`,
      }))}
      onChange={(id) =>
        void run(async () => setOrder(await api<OrderView>('/orders/' + id)))
      }
    />
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>订单测试中心</h1>
          <p>使用真实商品和服务端规则验证下单流程；所有支付、配送均为模拟。</p>
        </div>
        <Button onClick={() => void run(refresh)}>刷新订单</Button>
      </div>
      <Alert
        type="warning"
        showIcon
        title="仅模拟 · 会预占本测试环境库存，不产生真实付款、配送或营业额"
      />
      {error && <Alert type="error" title={error} showIcon />}
      <Tabs
        items={[
          {
            key: 'checkout',
            label: '购物车与结算',
            children: (
              <section className="panel">
                <h2>选择商品 · 必填</h2>
                <Space wrap>
                  <Select
                    aria-label="测试商品规格"
                    showSearch
                    optionFilterProp="label"
                    style={{ minWidth: 320 }}
                    placeholder="选择商品与规格"
                    value={variant || undefined}
                    options={variants}
                    onChange={(v) => {
                      setVariant(v);
                      setModifiers([]);
                    }}
                  />
                  <InputNumber
                    aria-label="商品数量"
                    min={1}
                    max={1000}
                    value={quantity}
                    onChange={(v) => setQuantity(v ?? 1)}
                  />
                </Space>
                {product?.modifierGroupRecords.map((group) => (
                  <div key={group.id}>
                    <p>
                      {group.name}（选 {group.minSelections}～
                      {group.maxSelections} 项）
                    </p>
                    <Checkbox.Group
                      value={modifiers.filter((id) =>
                        group.modifierRecords.some((m) => m.id === id),
                      )}
                      options={group.modifierRecords.map((m) => ({
                        label: `${m.name} ${orderMoney(m.salePriceFen)}`,
                        value: m.id,
                      }))}
                      onChange={(ids) =>
                        setModifiers((old) => [
                          ...old.filter(
                            (id) =>
                              !group.modifierRecords.some((m) => m.id === id),
                          ),
                          ...(ids as string[]),
                        ])
                      }
                    />
                  </div>
                ))}
                <Button
                  style={{ marginTop: 16 }}
                  disabled={!variant || busy}
                  onClick={() => {
                    setCart((old) => [
                      ...old.filter((l) => l.variantId !== variant),
                      { variantId: variant, quantity, modifierIds: modifiers },
                    ]);
                    invalidate();
                  }}
                >
                  加入购物车
                </Button>
                <Table
                  rowKey="variantId"
                  pagination={false}
                  dataSource={cart}
                  locale={{ emptyText: '购物车还没有商品' }}
                  columns={[
                    {
                      title: '商品',
                      dataIndex: 'variantId',
                      render: (id) =>
                        variants.find((v) => v.value === id)?.label,
                    },
                    { title: '数量', dataIndex: 'quantity' },
                    {
                      title: '操作',
                      render: (_, row) => (
                        <Button
                          onClick={() => {
                            setCart(
                              cart.filter((l) => l.variantId !== row.variantId),
                            );
                            invalidate();
                          }}
                        >
                          移除
                        </Button>
                      ),
                    },
                  ]}
                />
                <h3>履约方式 · 必填</h3>
                <Space wrap>
                  <Select
                    aria-label="履约方式"
                    value={mode}
                    options={[
                      { value: 'PICKUP', label: '到店自取' },
                      { value: 'DINE_IN', label: '堂食' },
                      { value: 'DELIVERY', label: '模拟配送' },
                    ]}
                    onChange={(v) => {
                      setMode(v);
                      invalidate();
                    }}
                  />
                  {mode === 'DELIVERY' && (
                    <Select
                      aria-label="配送距离"
                      value={distance}
                      options={[3000, 5000, 8000].map((v) => ({
                        value: v,
                        label: `${v / 1000} 公里`,
                      }))}
                      onChange={(v) => {
                        setDistance(v);
                        invalidate();
                      }}
                    />
                  )}
                  <Button
                    type="primary"
                    disabled={!cart.length || busy}
                    onClick={() => void run(calculate)}
                  >
                    计算结算预览
                  </Button>
                </Space>
                <p className="muted">
                  系统自动读取售价、门店优惠和配送报价。修改购物车后必须重新结算。
                </p>
                {preview && (
                  <Card title="本次结算">
                    <Alert
                      type={preview.decision === 'PASS' ? 'success' : 'warning'}
                      title={preview.message}
                    />
                    <p>
                      商品 {orderMoney(preview.goodsFen)} · 商家优惠{' '}
                      {orderMoney(preview.merchantDiscountFen)} · 平台优惠{' '}
                      {orderMoney(preview.platformDiscountFen)}
                    </p>
                    <p>
                      包装 {orderMoney(preview.packagingRevenueFen)} · 配送{' '}
                      {orderMoney(preview.customerDeliveryFeeFen)}
                    </p>
                    <h2>
                      应付{' '}
                      {orderMoney(
                        preview.payableFen +
                          (consent ? (preview.requiredTopupFen ?? 0) : 0),
                      )}
                    </h2>
                    {preview.decision === 'TOPUP' && (
                      <Checkbox
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                      >
                        我同意额外补付配送费{' '}
                        {orderMoney(preview.requiredTopupFen ?? 0)}
                      </Checkbox>
                    )}
                    <Button
                      type="primary"
                      disabled={
                        busy ||
                        !(
                          preview.decision === 'PASS' ||
                          (preview.decision === 'TOPUP' && consent)
                        )
                      }
                      onClick={() =>
                        void run(async () => {
                          await create();
                        })
                      }
                    >
                      提交测试订单
                    </Button>
                  </Card>
                )}
              </section>
            ),
          },
          {
            key: 'faults',
            label: '故障与恢复',
            children: (
              <section className="panel">
                <h2>选择订单</h2>
                {selectedOrder}
                <p>
                  每次操作都调用服务端，并保留订单记录。状态不匹配时服务端会拒绝操作。
                </p>
                <Space wrap>
                  <Button
                    disabled={!order || busy}
                    onClick={() => void run(() => action('PAY_FAIL'))}
                  >
                    模拟付款失败
                  </Button>
                  <Button
                    disabled={!order || busy}
                    onClick={() =>
                      void run(async () => {
                        const key = crypto.randomUUID();
                        await action('PAY', key);
                        await action('PAY', key);
                        note(
                          '重复付款事件已重放；请在订单详情核对付款与库存仅变化一次',
                        );
                      })
                    }
                  >
                    重复付款事件
                  </Button>
                  <Button
                    disabled={!preview || busy}
                    onClick={() =>
                      void run(async () => {
                        const key = createKey;
                        const a = await create(key);
                        const b = await create(key);
                        note(
                          a.id === b.id
                            ? '网络重试通过：返回同一订单'
                            : '异常：订单编号不一致',
                        );
                      })
                    }
                  >
                    模拟断线后重试下单
                  </Button>
                  <Button
                    disabled={!preview || busy}
                    onClick={() =>
                      void run(async () => {
                        const requests = await Promise.allSettled([
                          create(crypto.randomUUID()),
                          create(crypto.randomUUID()),
                        ]);
                        note(
                          `并发结果：${requests.filter((r) => r.status === 'fulfilled').length} 笔创建成功，${requests.filter((r) => r.status === 'rejected').length} 笔被拒绝；请核对库存余量`,
                        );
                      })
                    }
                  >
                    两笔订单并发抢库存
                  </Button>
                  <Button
                    disabled={!order || busy}
                    onClick={() => void run(() => action('DRIVER_FAIL'))}
                  >
                    模拟骑手接单失败
                  </Button>
                  <Button
                    disabled={!order || busy}
                    onClick={() =>
                      void run(async () => {
                        const value = await api<OrderView>(
                          `/order-test/orders/${order!.id}/timeout`,
                          'POST',
                          {},
                        );
                        setOrder(value);
                        note('超时恢复：订单已关闭，库存已释放');
                        await refresh();
                      })
                    }
                  >
                    模拟超时
                  </Button>
                  <Button
                    disabled={!order || busy}
                    onClick={() =>
                      void run(async () => {
                        setOrder(
                          await api<OrderView>(
                            `/order-test/orders/${order!.id}/requote`,
                            'POST',
                            {
                              idempotencyKey: crypto.randomUUID(),
                              increase: true,
                            },
                          ),
                        );
                        note(
                          '已模拟配送报价上涨；原价订单不能跳过校验继续配送',
                        );
                      })
                    }
                  >
                    模拟配送报价上涨
                  </Button>
                  <Button
                    disabled={!order || busy}
                    onClick={() =>
                      void run(async () => {
                        setOrder(
                          await api<OrderView>(
                            `/order-test/orders/${order!.id}/requote`,
                            'POST',
                            {
                              idempotencyKey: crypto.randomUUID(),
                              increase: false,
                            },
                          ),
                        );
                        note('已重新获取正常模拟报价；下一步操作仍会重新校验');
                      })
                    }
                  >
                    恢复报价 / 重新询价
                  </Button>
                  {session.identity.role === 'OWNER' && (
                    <Button
                      danger
                      disabled={!order || busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            '确认终止此测试订单、模拟退款并释放预占库存？',
                          )
                        )
                          void run(() => action('RECOVER_CANCEL'));
                      }}
                    >
                      异常终止并退款
                    </Button>
                  )}
                </Space>
                <p>
                  付款失败、取消或超时后请返回购物车重新预览下单；骑手失败后可重新发配送；报价变化可重新询价或由老板终止后重下。
                </p>
              </section>
            ),
          },
          ...(session.identity.role === 'OWNER'
            ? [
                {
                  key: 'settings',
                  label: '测试门店结算设置',
                  forceRender: true,
                  children: (
                    <section className="panel">
                      <Alert
                        type="info"
                        title="系统自动使用已保存的利润保护规则；以下设置由老板确认，保存后旧预览需要重新计算"
                      />
                      <Form
                        form={form}
                        layout="vertical"
                        onFinish={(values) =>
                          void run(async () => {
                            const next = {
                              ...terms,
                              orderPackaging: values.orderPackaging ?? [],
                              promotion:
                                yuanToFen(values.promotionDiscount) > 0
                                  ? {
                                      thresholdFen: yuanToFen(
                                        values.promotionThreshold,
                                      ),
                                      discountFen: yuanToFen(
                                        values.promotionDiscount,
                                      ),
                                    }
                                  : null,
                              ...Object.fromEntries(
                                amountFields.map(([key]) => [
                                  key,
                                  yuanToFen(values[key]),
                                ]),
                              ),
                            };
                            await api('/orders/settings', 'PUT', {
                              autoAccept: !!values.autoAccept,
                              terms: next,
                            });
                            setTerms(next);
                            invalidate();
                            note('门店结算设置已保存');
                          })
                        }
                      >
                        <h3>必填 · 确认结算策略</h3>
                        <Form.Item name="autoAccept" valuePropName="checked">
                          <Checkbox>
                            授权自动接单（仅已付款且利润保护校验通过的订单）
                          </Checkbox>
                        </Form.Item>
                        <Collapse
                          items={[
                            {
                              key: 'fees',
                              label: '选填 · 包装、配送与优惠金额',
                              children: amountFields.map(([key, label]) => (
                                <Form.Item
                                  key={key}
                                  name={key}
                                  label={`${label}（元）`}
                                  rules={[
                                    {
                                      required: true,
                                      message: '请填写金额；无费用时填 0',
                                    },
                                  ]}
                                >
                                  <Input inputMode="decimal" />
                                </Form.Item>
                              )),
                            },
                          ]}
                        />
                        <Collapse
                          items={[
                            {
                              key: 'order-packaging',
                              label: '选填 · 整单包装与满减',
                              children: (
                                <>
                                  <Form.List name="orderPackaging">
                                    {(fields, { add, remove }) => (
                                      <>
                                        {fields.map((field) => (
                                          <Space
                                            key={field.key}
                                            align="baseline"
                                          >
                                            <Form.Item
                                              name={[
                                                field.name,
                                                'packagingItemId',
                                              ]}
                                              rules={[
                                                {
                                                  required: true,
                                                  message: '请选择包装',
                                                },
                                              ]}
                                            >
                                              <Select
                                                aria-label="整单包装"
                                                style={{ minWidth: 180 }}
                                                options={packaging.map((p) => ({
                                                  value: p.id,
                                                  label: p.name,
                                                }))}
                                              />
                                            </Form.Item>
                                            <Form.Item
                                              name={[field.name, 'quantity']}
                                              rules={[
                                                {
                                                  required: true,
                                                  message: '请填写数量',
                                                },
                                              ]}
                                            >
                                              <InputNumber
                                                aria-label="整单包装数量"
                                                min={1}
                                                max={1000}
                                                precision={0}
                                              />
                                            </Form.Item>
                                            <Button
                                              onClick={() => remove(field.name)}
                                            >
                                              移除包装
                                            </Button>
                                          </Space>
                                        ))}
                                        <Button
                                          disabled={!packaging.length}
                                          onClick={() => add({ quantity: 1 })}
                                        >
                                          添加整单包装
                                        </Button>
                                        {!packaging.length && (
                                          <p>
                                            当前没有可用整单包装，请先在成本中心配置。
                                          </p>
                                        )}
                                      </>
                                    )}
                                  </Form.List>
                                  <Form.Item
                                    name="promotionThreshold"
                                    label="满减门槛（元）"
                                  >
                                    <Input inputMode="decimal" />
                                  </Form.Item>
                                  <Form.Item
                                    name="promotionDiscount"
                                    label="满减优惠（元，0 表示不启用）"
                                  >
                                    <Input inputMode="decimal" />
                                  </Form.Item>
                                </>
                              ),
                            },
                          ]}
                        />
                        <Button htmlType="submit" type="primary" loading={busy}>
                          确认保存结算设置
                        </Button>
                      </Form>
                    </section>
                  ),
                },
              ]
            : []),
        ]}
      />
      {order && (
        <Card title={`当前测试订单 ${order.id.slice(-8)}`}>
          <Tag color="blue">{orderLabels[order.orderStatus]}</Tag>
          <span>{orderMoney(order.payableFen)}</span>
          {order.issue && <Alert type="warning" title={order.issue} />}
          <Space wrap style={{ marginTop: 16 }}>
            {orderActions(order).map((a) => (
              <Button
                key={a}
                disabled={busy}
                onClick={() => void run(() => action(a))}
              >
                {actionLabels[a]}
              </Button>
            ))}
          </Space>
        </Card>
      )}
      <section className="panel">
        <h3>本次测试结果</h3>
        {results.length ? (
          results.map((r, i) => <p key={i}>{r}</p>)
        ) : (
          <p className="muted">
            执行场景后显示真实接口结果，最多保留最近 20
            条；订单历史保存在服务端。
          </p>
        )}
      </section>
    </>
  );
}
