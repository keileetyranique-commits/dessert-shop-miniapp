import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Collapse,
  Form,
  Input,
  InputNumber,
  Select,
  Spin,
  Switch,
  Table,
  Tag,
} from 'antd';
import { Link } from 'react-router-dom';
import {
  fen,
  formatFen,
  type PricingRule,
  type simulatePricing,
} from '@platform/shared';
import { useCatalog } from './Data';
import { useSession } from './Session';
import { yuanToFen } from './product-save';
import { AdminRequestError } from '../admin-client';
import type { Package } from '../admin-types';
type Result = ReturnType<typeof simulatePricing> & {
  simulationId: string;
  ruleId?: string | null;
  evidence?: {
    lines: {
      quantity: number;
      variant: { name: string; product: { name: string } };
      cost: {
        recipeId: string | null;
        purchaseIds: (string | null)[];
        response: {
          recipeVersion: number | null;
          calculationVersion: string;
          ingredientCostFen: number;
          packagingCostFen: number;
          variableCostFen: number;
        };
      };
    }[];
  };
};
type RuleRecord = { id: string; rules: PricingRule };
const money = (n: number | null) =>
  n === null ? '待确认' : '¥' + formatFen(fen(n));
const missingText = (v: string) =>
  v
    .replace(/PURCHASE_PRICE:\d+/g, '原料采购价格')
    .replaceAll('BOM', '商品配方')
    .replaceAll('PACKAGING', '履约包装清单')
    .replaceAll('VARIABLE_COST', '可变人工设置')
    .replaceAll('FIXED_COST', '当月固定成本与分摊设置')
    .replaceAll('ITEMS_PER_ORDER', '每单份数');
function errorText(e: unknown) {
  if (e instanceof AdminRequestError) {
    if (e.status === 400)
      return '请检查优惠、配送费用和商品选项，金额或选项组合不符合要求';
    if (e.status === 404)
      return '所选商品、包装已不可用或不属于当前门店，请刷新重选';
    return e.message;
  }
  return e instanceof Error ? e.message : '暂时无法完成计算，请稍后重试';
}
function Amount({
  name,
  label,
  required = false,
}: {
  name: string | (string | number)[];
  label: string;
  required?: boolean;
}) {
  return (
    <Form.Item
      name={name}
      label={label + '（元）'}
      rules={[
        { required, message: '请填写金额' },
        {
          validator: (_, v) => {
            if (!v && !required) return Promise.resolve();
            try {
              yuanToFen(String(v));
              return Promise.resolve();
            } catch {
              return Promise.reject(Error('请输入非负金额，最多两位小数'));
            }
          },
        },
      ]}
    >
      <Input
        inputMode="decimal"
        placeholder={required ? '例如 18.80' : '0.00'}
      />
    </Form.Item>
  );
}
export function Pricing() {
  const session = useSession();
  if (!['OWNER', 'COST_MANAGER'].includes(session.identity.role))
    return (
      <Alert
        type="info"
        showIcon
        title="仅老板和成本负责人可查看利润资料，请联系老板"
      />
    );
  return <PricingWorkspace key={session.storeId} />;
}
function PricingWorkspace() {
  const { products, api } = useCatalog();
  const [rule, setRule] = useState<RuleRecord | null>(null),
    [packages, setPackages] = useState<Package[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState<Result | null>(null);
  const [form] = Form.useForm();
  const fulfillment = Form.useWatch('fulfillment', form);
  const items = Form.useWatch('items', form) ?? [];
  useEffect(() => {
    let active = true;
    Promise.all([
      api<RuleRecord | null>('/pricing/rules'),
      api<Package[]>('/costs/packaging'),
    ])
      .then(([r, p]) => {
        if (active) {
          setRule(r);
          setPackages(
            p.filter((x) => x.scope === 'ORDER' && x.status === 'ACTIVE'),
          );
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);
  if (loading) return <Spin aria-label="正在读取利润设置" />;
  const variants = products.flatMap((p) =>
    p.variantRecords.map((v) => ({
      value: v.id,
      label: `${p.name} / ${v.name} · ${money(v.salePriceFen)}`,
      product: p,
    })),
  );
  const submit = async (v: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const amount = (key: string) => yuanToFen(String(v[key] || '0'));
      const lines = v.items as {
        variantId: string;
        quantity: number;
        price?: string;
        modifierIds?: string[];
      }[];
      const now = new Date();
      const quote =
        v.fulfillment === 'DELIVERY' &&
        v.quotePrice !== undefined &&
        v.quotePrice !== ''
          ? {
              priceFen: amount('quotePrice'),
              distanceMeters: Number(v.distanceMeters),
              quotedAt: now.toISOString(),
              expiresAt: new Date(now.getTime() + 5 * 60000).toISOString(),
            }
          : null;
      const request = {
        // Collapsed optional fields may not be registered yet; initial month still lives in the form store.
        month: v.month ?? form.getFieldValue('month'),
        fulfillment: v.fulfillment,
        items: lines.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
          modifierIds: i.modifierIds ?? [],
          ...(i.price ? { salePriceFen: yuanToFen(i.price) } : {}),
        })),
        packagingRevenueFen: amount('packagingRevenue'),
        orderPackaging: ((v.packages ?? []) as string[]).map(
          (packagingItemId) => ({ packagingItemId, quantity: 1 }),
        ),
        customerDeliveryFeeFen:
          fulfillment === 'DELIVERY' ? amount('customerDelivery') : 0,
        deliverySubsidyFen:
          fulfillment === 'DELIVERY' ? amount('deliverySubsidy') : 0,
        merchantDiscountFen: amount('merchantDiscount'),
        platformDiscountFen: amount('platformDiscount'),
        discountBps: amount('discountPercent'),
        promotion: v.threshold
          ? {
              thresholdFen: amount('threshold'),
              discountFen: amount('promotionDiscount'),
            }
          : null,
        quote,
      };
      setResult(await api<Result>('/pricing/simulate', 'POST', request));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const decision = {
    PASS: '当前方案满足利润保护条件',
    TOPUP: '建议补足配送差价后再确认',
    REJECT: '当前方案有风险，建议调整',
    MANUAL_REVIEW: '资料尚不完整，请先人工确认',
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>定价与利润保护</h1>
          <p>看清这一单赚多少，再决定售价与优惠。</p>
        </div>
        <Link to="/admin/analysis/costs">完善成本资料</Link>
      </div>
      <Alert
        type="info"
        showIcon
        title="经营模拟，不会改商品售价、接单、扣款或呼叫骑手。手工报价仅供本次估算。"
      />
      {error && <Alert type="error" showIcon title={error} />}
      {!rule && !error && (
        <Alert
          type="warning"
          title="尚未设置利润底线，请老板展开下方保护设置并保存；设置前不会判定可以接单。"
        />
      )}
      <div className="pricing-grid">
        <section className="panel">
          <h2>如果这样卖</h2>
          <Form
            form={form}
            disabled={busy}
            layout="vertical"
            onFinish={submit}
            onValuesChange={() => setResult(null)}
            initialValues={{
              month: new Intl.DateTimeFormat('sv-SE', {
                timeZone: 'Asia/Shanghai',
                year: 'numeric',
                month: '2-digit',
              }).format(new Date()),
              fulfillment: 'PICKUP',
              items: [{ quantity: 1 }],
            }}
          >
            <h3>必填</h3>
            <Form.List name="items">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((f) => {
                    const p = variants.find(
                      (x) => x.value === items[f.name]?.variantId,
                    )?.product;
                    return (
                      <div className="pricing-item" key={f.key}>
                        <Form.Item
                          label="商品与规格"
                          name={[f.name, 'variantId']}
                          rules={[
                            { required: true, message: '请选择商品规格' },
                          ]}
                        >
                          <Select
                            showSearch
                            optionFilterProp="label"
                            options={variants}
                            onChange={() =>
                              form.setFieldValue(
                                ['items', f.name, 'modifierIds'],
                                [],
                              )
                            }
                          />
                        </Form.Item>
                        <Form.Item
                          label="份数"
                          name={[f.name, 'quantity']}
                          rules={[{ required: true }]}
                        >
                          <InputNumber min={1} max={1000} precision={0} />
                        </Form.Item>
                        <Amount
                          label="模拟单份售价 · 选填，留空沿用当前售价"
                          name={[f.name, 'price']}
                        />
                        {!!p?.modifierGroupRecords.length && (
                          <Form.Item
                            name={[f.name, 'modifierIds']}
                            label="附加选项 · 每份相同选择"
                          >
                            <Select
                              mode="multiple"
                              options={p.modifierGroupRecords.flatMap((g) =>
                                g.modifierRecords
                                  .filter((m) => m.status === 'ACTIVE')
                                  .map((m) => ({
                                    value: m.id,
                                    label: `${g.name} / ${m.name} +${money(m.salePriceFen)}`,
                                  })),
                              )}
                            />
                          </Form.Item>
                        )}
                        {fields.length > 1 && (
                          <Button onClick={() => remove(f.name)}>
                            移除此项
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  <Button
                    onClick={() => add({ quantity: 1 })}
                    disabled={fields.length >= 30}
                  >
                    添加商品组合
                  </Button>
                </>
              )}
            </Form.List>
            <Form.Item name="fulfillment" label="履约方式">
              <Select
                options={[
                  { value: 'PICKUP', label: '到店自取' },
                  { value: 'DINE_IN', label: '堂食' },
                  { value: 'DELIVERY', label: '配送' },
                ]}
              />
            </Form.Item>
            {fulfillment === 'DELIVERY' && (
              <>
                <Form.Item
                  name="distanceMeters"
                  label="配送距离（米）· 必填"
                  rules={[{ required: true, message: '请填写配送距离' }]}
                >
                  <InputNumber min={0} max={1000000} precision={0} />
                </Form.Item>
                <div className="actions">
                  {[3000, 5000, 8000].map((n) => (
                    <Button
                      key={n}
                      onClick={() => {
                        form.setFieldValue('distanceMeters', n);
                        setResult(null);
                      }}
                    >
                      {n / 1000} 公里
                    </Button>
                  ))}
                </div>
                <Amount name="quotePrice" label="配送商报价 · 必填" required />
                <Amount name="customerDelivery" label="顾客原配送费" />
                <Amount name="deliverySubsidy" label="商家减免顾客配送费" />
                <p className="hint">
                  系统自动：每次计算将手工报价标记为当前报价，五分钟有效；不表示配送商已接受此报价。
                </p>
              </>
            )}
            <Collapse
              items={[
                {
                  key: 'more',
                  forceRender: true,
                  label: '选填 · 优惠与包装',
                  children: (
                    <>
                      <Amount name="merchantDiscount" label="商家承担商品券" />
                      <Amount name="platformDiscount" label="平台承担商品券" />
                      <Form.Item
                        name="discountPercent"
                        label="额外商品折扣优惠（%）"
                        rules={[
                          {
                            validator: (_, v) => {
                              try {
                                if (v && yuanToFen(String(v)) > 10000)
                                  throw Error();
                                return Promise.resolve();
                              } catch {
                                return Promise.reject(
                                  Error(
                                    '请输入 0 至 100 的百分比，最多两位小数',
                                  ),
                                );
                              }
                            },
                          },
                        ]}
                      >
                        <Input placeholder="例如 10 表示减免 10%" />
                      </Form.Item>
                      <Amount
                        name="threshold"
                        label="满减门槛 · 按商品原应收"
                      />
                      <Amount name="promotionDiscount" label="达到门槛减免" />
                      <Amount
                        name="packagingRevenue"
                        label="向顾客收取包装费"
                      />
                      <Form.Item
                        name="packages"
                        label="整单公共包装 · 每项一个"
                      >
                        <Select
                          mode="multiple"
                          options={packages.map((p) => ({
                            value: p.id,
                            label: `${p.name} · 成本 ${money(p.unitCostFen)}`,
                          }))}
                        />
                      </Form.Item>
                      <p className="hint">
                        不选择表示本次明确无需整单公共包装。商品包装与人工由成本中心自动读取，避免重复计入。
                      </p>
                      <Form.Item
                        name="month"
                        label="固定成本月份 · 系统默认本月"
                        rules={[{ required: true }]}
                      >
                        <Input type="month" />
                      </Form.Item>
                    </>
                  ),
                },
              ]}
            />
            <Button type="primary" htmlType="submit" loading={busy} block>
              计算利润与安全底价
            </Button>
          </Form>
        </section>
        <section className="panel pricing-result">
          <h2>这单值不值得接</h2>
          {!result ? (
            <p className="muted">选择真实商品并计算，结果会在这里显示。</p>
          ) : (
            <>
              <Alert
                type={result.decision === 'PASS' ? 'success' : 'warning'}
                title={decision[result.decision]}
                showIcon
              />
              <h2>
                {result.complete
                  ? `预计贡献利润 ${money(result.current.contributionProfitFen)}`
                  : '暂时无法确认是否盈利'}
              </h2>
              <p>
                贡献利润只扣本单增加的成本；全成本利润再扣当月固定费用分摊。
              </p>
              {result.requiredTopupFen !== null && (
                <p>
                  建议补差：<strong>{money(result.requiredTopupFen)}</strong>
                  ，顾客确认前需重新计算。
                </p>
              )}
              {[
                ...result.missingInputs.map(missingText),
                ...result.blockedReasons,
                ...result.warnings,
              ].map((x, i) => (
                <p key={i}>
                  <Tag color="orange">需处理</Tag>
                  {x}
                </p>
              ))}
              {!!result.missingInputs.length && (
                <Link to="/admin/analysis/costs">去补全成本与设置</Link>
              )}
              <Table
                pagination={false}
                size="small"
                rowKey="name"
                columns={[
                  { title: '整单口径', dataIndex: 'name' },
                  { title: '普通售价', dataIndex: 'ordinary' },
                  { title: '当前活动', dataIndex: 'activity' },
                ]}
                dataSource={[
                  ['顾客实付', 'customerPaidFen'],
                  ['商家收入（含平台补贴）', 'merchantRevenueFen'],
                  ['贡献利润', 'contributionProfitFen'],
                  ['全成本利润', 'fullCostProfitFen'],
                ].map(([name, key]) => ({
                  name,
                  ordinary:
                    !result.complete && key!.includes('Profit')
                      ? '资料待补全'
                      : money(
                          result.ordinary[
                            key as keyof Result['ordinary']
                          ] as number,
                        ),
                  activity:
                    !result.complete && key!.includes('Profit')
                      ? '资料待补全'
                      : money(
                          result.current[
                            key as keyof Result['current']
                          ] as number,
                        ),
                }))}
              />
              <div className="pricing-prices">
                <p>
                  普通最低安全总价 <b>{money(result.minimumSafeGoodsFen)}</b>
                </p>
                <p>
                  活动最低商品总价{' '}
                  <b>{money(result.activityMinimumGoodsFen)}</b>
                </p>
                <p>
                  达到全成本目标的建议总价{' '}
                  <b>{money(result.recommendedGoodsFen)}</b>
                </p>
              </div>
              <p className="hint">
                {result.priceBasis}
                。“待确认”也可能表示在允许金额范围内无可行价格。满减触发后可能再次低于底线，调整售价后请重新计算。
              </p>
              <Collapse
                items={[
                  {
                    key: 'basis',
                    label: '查看费用、口径与计算依据',
                    children: (
                      <>
                        {(
                          [
                            ['支付手续费', 'paymentFeeFen'],
                            ['渠道佣金', 'commissionFen'],
                            ['配送商报价', 'deliveryCostFen'],
                            ['商家净配送负担', 'merchantDeliveryBurdenFen'],
                            ['本单可变成本合计', 'variableCostFen'],
                            ['本单固定成本分摊', 'allocatedFixedCostFen'],
                          ] as const
                        ).map(([label, k]) => (
                          <p key={k}>
                            {label}：{money(result.current[k])}
                          </p>
                        ))}
                        <p>{result.rounding}</p>
                        <p>
                          支付手续费基于顾客实付；渠道佣金基于商家商品应收（含平台补贴），不包含包装与配送收入。
                        </p>
                        <p>
                          计算时间：
                          {new Date(result.calculatedAt).toLocaleString(
                            'zh-CN',
                            { timeZone: 'Asia/Shanghai' },
                          )}
                          （北京时间）
                        </p>
                        <p>核对编号：{result.simulationId}</p>
                        <p>
                          每份平均贡献利润：
                          {result.complete
                            ? `${money(result.current.perItemContributionFen.numerator)} ÷ ${result.current.perItemContributionFen.denominator} 份`
                            : '成本待补全'}
                          ；整单金额为主要判断依据，不把舍入后的每份利润乘回整单。
                        </p>
                        {result.evidence?.lines.map((line, index) => (
                          <div key={index} className="pricing-item">
                            <strong>
                              {line.variant.product.name} / {line.variant.name}{' '}
                              × {line.quantity}
                            </strong>
                            <p>
                              单份原料{' '}
                              {money(line.cost.response.ingredientCostFen)} ·
                              包装 {money(line.cost.response.packagingCostFen)}{' '}
                              · 可变人工及其他{' '}
                              {money(line.cost.response.variableCostFen)}
                            </p>
                            <p>
                              配方版本：
                              {line.cost.response.recipeVersion ?? '待补全'}
                              ；引用采购记录{' '}
                              {line.cost.purchaseIds.filter(Boolean).length} 条
                            </p>
                          </div>
                        ))}
                        <p className="hint">
                          高级核验：计算版本 {result.calculationVersion}
                          ；保护规则编号 {result.ruleId ?? '尚未配置'}
                          。完整配方、采购来源与输入保存在本次模拟记录中。
                        </p>
                      </>
                    ),
                  },
                ]}
              />
            </>
          )}
        </section>
      </div>
      <Collapse
        items={[
          {
            key: 'rule',
            label: '高级设置 · 利润保护与费用规则',
            children: (
              <RuleEditor
                record={rule}
                locked={busy}
                onSaved={(r) => {
                  setRule(r);
                  setResult(null);
                }}
              />
            ),
          },
        ]}
      />
    </>
  );
}
function RuleEditor({
  record,
  locked,
  onSaved,
}: {
  record: RuleRecord | null;
  locked: boolean;
  onSaved: (r: RuleRecord) => void;
}) {
  const { api } = useCatalog();
  const session = useSession();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [form] = Form.useForm();
  useEffect(() => {
    if (!record) return;
    const r = record.rules;
    const values: Record<string, unknown> = {
      maximumDistanceMeters: r.maximumDistanceMeters,
      allowTopup: r.allowTopup,
    };
    for (const k of [
      'minimumProfitFen',
      'targetProfitFen',
      'maximumSubsidyFen',
      'minimumMarginBps',
      'targetMarginBps',
    ] as const)
      values[k] = formatFen(fen(r[k]));
    for (const key of ['payment', 'commission'] as const)
      for (const [k, v] of Object.entries(r[key]))
        values[key + k] = v === null ? '' : formatFen(fen(v));
    form.setFieldsValue(values);
  }, [record, form]);
  const owner = session.identity.role === 'OWNER';
  return (
    <Form
      form={form}
      layout="vertical"
      disabled={!owner || locked || busy}
      onFinish={async (v) => {
        setBusy(true);
        setError('');
        setSaved(false);
        try {
          const amount = (k: string) => yuanToFen(String(v[k] ?? '0'));
          const fee = (k: string) => ({
            rateBps: amount(k + 'rateBps'),
            fixedFen: amount(k + 'fixedFen'),
            minimumFen: amount(k + 'minimumFen'),
            capFen: v[k + 'capFen'] ? amount(k + 'capFen') : null,
          });
          const rules: PricingRule = {
            minimumProfitFen: amount('minimumProfitFen'),
            minimumMarginBps: amount('minimumMarginBps'),
            targetProfitFen: amount('targetProfitFen'),
            targetMarginBps: amount('targetMarginBps'),
            maximumSubsidyFen: amount('maximumSubsidyFen'),
            maximumDistanceMeters: v.maximumDistanceMeters,
            allowTopup: !!v.allowTopup,
            payment: fee('payment'),
            commission: fee('commission'),
          };
          onSaved(await api<RuleRecord>('/pricing/rules', 'PUT', rules));
          setSaved(true);
        } catch (e) {
          setError(errorText(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>
        仅老板可保存。按整单设定，记录新版本；不会覆盖过去模拟，也不会自动改价。
      </p>
      <div className="pricing-grid">
        <div>
          <Amount
            name="minimumProfitFen"
            label="最低贡献利润 · 必填"
            required
          />
          <Amount
            name="targetProfitFen"
            label="目标全成本利润 · 必填"
            required
          />
          <Amount
            name="maximumSubsidyFen"
            label="商家净配送负担上限 · 必填"
            required
          />
          {['minimumMarginBps', 'targetMarginBps'].map((k, i) => (
            <Form.Item
              key={k}
              name={k}
              label={
                i ? '目标全成本利润率（%）· 必填' : '最低贡献利润率（%）· 必填'
              }
              rules={[
                { required: true },
                {
                  validator: (_, v) => {
                    try {
                      if (yuanToFen(String(v)) > 10000) throw Error();
                      return Promise.resolve();
                    } catch {
                      return Promise.reject(
                        Error('请输入 0 至 100，最多两位小数'),
                      );
                    }
                  },
                },
              ]}
            >
              <Input />
            </Form.Item>
          ))}
          <Form.Item
            name="maximumDistanceMeters"
            label="最大配送距离（米）· 必填"
            rules={[{ required: true }]}
          >
            <InputNumber min={0} max={100000} precision={0} />
          </Form.Item>
          <Form.Item
            name="allowTopup"
            label="允许建议补配送差价"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </div>
        <div>
          {(['payment', 'commission'] as const).map((key, i) => (
            <div key={key}>
              <h3>{i ? '渠道佣金' : '支付手续费'}</h3>
              <Form.Item
                name={key + 'rateBps'}
                label="费率（%）· 必填"
                rules={[{ required: true }]}
              >
                <Input />
              </Form.Item>
              <Amount
                name={key + 'fixedFen'}
                label="固定收费 · 必填（没有请填 0）"
                required
              />
              <Amount
                name={key + 'minimumFen'}
                label="最低收费 · 必填（没有请填 0）"
                required
              />
              <Amount
                name={key + 'capFen'}
                label="封顶 · 选填，留空表示不封顶"
              />
            </div>
          ))}
        </div>
      </div>
      {error && <Alert type="error" title={error} />}
      {saved && (
        <Alert type="success" title="已保存保护设置，请重新计算当前方案" />
      )}
      <Button type="primary" htmlType="submit" loading={busy}>
        保存利润保护设置
      </Button>
    </Form>
  );
}
