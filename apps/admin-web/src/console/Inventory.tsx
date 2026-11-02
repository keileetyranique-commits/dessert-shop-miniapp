import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd';
import { useCatalog } from './Data';
import { useSession } from './Session';
import { formatFen } from './catalog';

interface Row {
  id: string;
  productId: string;
  productName: string;
  name: string;
  salePriceFen: number;
  stockQuantity: number;
  reservedQuantity: number;
  available: number | null;
  unlimitedStock: boolean;
  soldOut: boolean;
  soldOutReason: string;
  lowStockThreshold: number | null;
  state: string;
  lowStock: boolean;
  inventoryUpdatedAt: string | null;
}
interface Movement {
  id: string;
  createdAt: string;
  delta: number;
  reason: string;
  actor: string;
  orderId: string | null;
  type: string;
  variant: { name: string; product: { name: string } };
}
interface Result {
  items: Row[];
  total: number;
  summary: Record<string, number>;
}
const states: Record<string, string> = {
  NORMAL: '库存正常',
  LOW: '库存紧张',
  EMPTY: '可售库存为零',
  PAUSED: '手动售罄',
  INACTIVE: '已下架',
  SAFETY: '安全停售',
  ARCHIVED: '已归档',
};
const types: Record<string, string> = {
  ADJUSTMENT: '手工调整',
  ORDER_COMPLETED: '订单完成扣减',
  SETTINGS: '售卖 / 预警设置',
};
const date = (v: string | null) =>
  v
    ? new Date(v).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    : '暂无记录';
const options = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));
export function Inventory() {
  const { api, canEdit, categories, products } = useCatalog();
  const { identity } = useSession();
  const [tab, setTab] = useState('stock'),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [history, setHistory] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1),
    [revision, refresh] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [result, setResult] = useState<Result>(),
    [movements, setMovements] = useState<{
      items: Movement[];
      total: number;
    }>();
  const [edit, setEdit] = useState<{
    row: Row;
    action: 'stock' | 'threshold' | 'sale';
  }>();
  const filter = (name: string, value: string | undefined) => {
    setPage(1);
    (tab === 'stock' ? setFilters : setHistory)((old) => ({
      ...old,
      [name]: value ?? '',
    }));
  };
  const current = tab === 'stock' ? filters : history;
  const query = new URLSearchParams({
    page: String(page),
    pageSize: '20',
    ...Object.fromEntries(Object.entries(current).filter(([, v]) => v)),
  }).toString();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const path = tab === 'stock' ? '/inventory?' : '/inventory/movements?';
    api<Result & { items: Row[] & Movement[] }>(path + query)
      .then((value) => {
        if (active) {
          if (tab === 'stock') setResult(value);
          else setMovements(value);
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : '库存暂时无法加载，请稍后重试',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, query, tab, revision]);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>库存工作台</h1>
          <p>看清还有多少可卖，及时补货，保留每次调整记录。</p>
        </div>
        <Button onClick={() => refresh((n) => n + 1)}>刷新数据</Button>
      </div>
      {notice && (
        <Alert
          type="success"
          title={notice}
          closable
          onClose={() => setNotice('')}
        />
      )}
      {error && <Alert type="error" title={error} showIcon />}
      {tab === 'stock' && result && !error && (
        <div className="inventory-metrics">
          {Object.entries({
            products: '商品总数',
            finite: '有限库存规格',
            unlimited: '不限库存规格',
            normal: '库存正常',
            empty: '已售罄',
            low: '库存紧张',
            reserved: '订单预占数量',
          }).map(([key, label]) => (
            <div className="panel metric" key={key}>
              <span>{label}</span>
              <strong>{result.summary[key]}</strong>
            </div>
          ))}
        </div>
      )}
      {tab === 'stock' && !error && !!result?.summary.archivedReserved && (
        <Alert
          type="warning"
          showIcon
          title={`已归档商品仍有 ${result.summary.archivedReserved} 件被订单预占，请筛选“已归档”核对。`}
        />
      )}
      <section className="panel inventory-panel">
        <Tabs
          activeKey={tab}
          onChange={(v) => {
            setTab(v);
            setPage(1);
            setError('');
          }}
          items={[
            { key: 'stock', label: '库存管理' },
            { key: 'history', label: '库存流水' },
          ]}
        />
        <p className="muted">
          实际库存包含订单已占用的数量；可售数量 = 实际库存 −
          订单预占。该数量不代表停售、下架或归档商品可以接新单。不限库存不计算可售件数。预警仅在老板设置阈值后生效，零库存也会提醒。总览不随筛选改变，订单预占包含已归档商品。
        </p>
        <div className="filters">
          {tab === 'stock' ? (
            <>
              <Input
                placeholder="搜索商品名称"
                aria-label="搜索商品名称"
                value={filters.productSearch ?? ''}
                onChange={(e) => filter('productSearch', e.target.value)}
              />
              <Input
                placeholder="搜索规格名称"
                aria-label="搜索规格名称"
                value={filters.variantSearch ?? ''}
                onChange={(e) => filter('variantSearch', e.target.value)}
              />
              <Select
                aria-label="分类筛选"
                placeholder="全部分类"
                allowClear
                value={filters.categoryId || undefined}
                onChange={(v) => filter('categoryId', v)}
                options={categories.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
              />
              <Select
                aria-label="库存状态筛选"
                placeholder="库存状态"
                allowClear
                value={filters.state || undefined}
                onChange={(v) => filter('state', v)}
                options={options(states)}
              />
              <Select
                aria-label="库存模式筛选"
                placeholder="全部库存模式"
                allowClear
                value={filters.mode || undefined}
                onChange={(v) => filter('mode', v)}
                options={[
                  { value: 'finite', label: '有限库存' },
                  { value: 'unlimited', label: '不限库存' },
                ]}
              />
              <Select
                aria-label="手动售罄筛选"
                placeholder="全部手动标记"
                allowClear
                value={filters.soldOut || undefined}
                onChange={(v) => filter('soldOut', v)}
                options={[
                  { value: 'true', label: '已手动售罄' },
                  { value: 'false', label: '未手动售罄' },
                ]}
              />
              <Select
                aria-label="库存排序"
                value={filters.sort || 'name'}
                onChange={(v) => filter('sort', v)}
                options={[
                  { value: 'name', label: '按商品名称' },
                  { value: 'available', label: '按可售数量' },
                  { value: 'updated', label: '按更新时间' },
                ]}
              />
              <Select
                aria-label="排序方向"
                value={filters.direction || 'asc'}
                onChange={(v) => filter('direction', v)}
                options={[
                  { value: 'asc', label: '升序' },
                  { value: 'desc', label: '降序' },
                ]}
              />
            </>
          ) : (
            <>
              <Input
                aria-label="流水商品名称"
                placeholder="搜索流水商品（含已归档）"
                value={history.productSearch ?? ''}
                onChange={(e) => filter('productSearch', e.target.value)}
              />
              <Input
                aria-label="流水规格名称"
                placeholder="搜索流水规格（含已归档）"
                value={history.variantSearch ?? ''}
                onChange={(e) => filter('variantSearch', e.target.value)}
              />
              <label>
                开始日期
                <Input
                  type="date"
                  value={
                    history.from
                      ? new Date(new Date(history.from).getTime() + 8 * 3600000)
                          .toISOString()
                          .slice(0, 10)
                      : ''
                  }
                  aria-label="开始日期"
                  onChange={(e) =>
                    filter(
                      'from',
                      e.target.value
                        ? new Date(
                            e.target.value + 'T00:00:00+08:00',
                          ).toISOString()
                        : '',
                    )
                  }
                />
              </label>
              <label>
                结束日期
                <Input
                  type="date"
                  aria-label="结束日期"
                  value={
                    history.to
                      ? new Date(new Date(history.to).getTime() + 8 * 3600000)
                          .toISOString()
                          .slice(0, 10)
                      : ''
                  }
                  onChange={(e) =>
                    filter(
                      'to',
                      e.target.value
                        ? new Date(
                            e.target.value + 'T23:59:59.999+08:00',
                          ).toISOString()
                        : '',
                    )
                  }
                />
              </label>
              <Select
                aria-label="流水商品"
                placeholder="全部商品"
                allowClear
                onChange={(v) => {
                  filter('productId', v);
                  filter('variantId', '');
                }}
                value={history.productId || undefined}
                options={products.map((p) => ({ value: p.id, label: p.name }))}
              />
              <Select
                aria-label="流水规格"
                placeholder="全部规格"
                allowClear
                onChange={(v) => filter('variantId', v)}
                value={history.variantId || undefined}
                options={products
                  .filter(
                    (p) => !history.productId || p.id === history.productId,
                  )
                  .flatMap((p) =>
                    p.variantRecords.map((v) => ({
                      value: v.id,
                      label: p.name + ' · ' + v.name,
                    })),
                  )}
              />
              <Select
                aria-label="流水类型"
                placeholder="全部类型"
                allowClear
                value={history.type || undefined}
                onChange={(v) => filter('type', v)}
                options={options(types)}
              />
            </>
          )}
        </div>
        {tab === 'stock' ? (
          <Table<Row>
            rowKey="id"
            loading={loading}
            dataSource={error ? [] : (result?.items ?? [])}
            scroll={{ x: 1250 }}
            locale={{
              emptyText: error ? (
                '请修复连接后重新加载'
              ) : (
                <Empty description="暂无库存数据" />
              ),
            }}
            pagination={{
              current: page,
              total: result?.total ?? 0,
              pageSize: 20,
              showSizeChanger: false,
              onChange: setPage,
            }}
            columns={[
              {
                title: '商品 / 规格',
                key: 'name',
                render: (_, r) => (
                  <>
                    <strong>{r.productName}</strong>
                    <div className="muted">{r.name}</div>
                  </>
                ),
              },
              { title: '售价', dataIndex: 'salePriceFen', render: formatFen },
              {
                title: '实际库存',
                key: 'stock',
                render: (_, r) =>
                  r.unlimitedStock ? '不限库存' : r.stockQuantity,
              },
              { title: '订单预占', dataIndex: 'reservedQuantity' },
              {
                title: '可售数量',
                key: 'available',
                render: (_, r) => r.available ?? '不限库存',
              },
              {
                title: '库存状态',
                key: 'state',
                render: (_, r) => (
                  <>
                    <Tag color={r.state === 'NORMAL' ? 'green' : 'orange'}>
                      {states[r.state] ?? '待核对'}
                    </Tag>
                    {r.lowStock && r.state !== 'LOW' && (
                      <Tag color="orange">库存紧张</Tag>
                    )}
                    {r.soldOut && (
                      <div className="muted">
                        {r.soldOutReason || '未记录售罄原因'}
                      </div>
                    )}
                  </>
                ),
              },
              {
                title: '预警数量',
                key: 'threshold',
                render: (_, r) =>
                  r.unlimitedStock
                    ? '不适用'
                    : (r.lowStockThreshold ?? '未设置'),
              },
              {
                title: '最近库存更新（北京时间）',
                dataIndex: 'inventoryUpdatedAt',
                render: date,
              },
              {
                title: '操作',
                key: 'actions',
                render: (_, row) =>
                  canEdit && row.state !== 'ARCHIVED' ? (
                    <Space wrap>
                      {!row.unlimitedStock && (
                        <Button
                          onClick={() => setEdit({ row, action: 'stock' })}
                        >
                          调整库存
                        </Button>
                      )}
                      {!row.unlimitedStock && identity.role === 'OWNER' && (
                        <Button
                          onClick={() => setEdit({ row, action: 'threshold' })}
                        >
                          设置预警
                        </Button>
                      )}
                      <Button
                        disabled={
                          row.soldOut &&
                          ['SAFETY', 'INACTIVE'].includes(row.state)
                        }
                        onClick={() => setEdit({ row, action: 'sale' })}
                      >
                        {row.soldOut ? '恢复售卖' : '标记售罄'}
                      </Button>
                    </Space>
                  ) : (
                    '只读'
                  ),
              },
            ]}
          />
        ) : (
          <Table<Movement>
            rowKey="id"
            loading={loading}
            dataSource={error ? [] : (movements?.items ?? [])}
            scroll={{ x: 1000 }}
            locale={{
              emptyText: error ? '请修复连接后重新加载' : '暂无库存流水',
            }}
            pagination={{
              current: page,
              total: movements?.total ?? 0,
              pageSize: 20,
              showSizeChanger: false,
              onChange: setPage,
            }}
            columns={[
              {
                title: '时间（北京时间）',
                dataIndex: 'createdAt',
                render: date,
              },
              {
                title: '商品 / 规格',
                key: 'product',
                render: (_, r) =>
                  r.variant.product.name + ' · ' + r.variant.name,
              },
              {
                title: '变动数量',
                dataIndex: 'delta',
                render: (v: number) => (v > 0 ? '+' + v : String(v)),
              },
              {
                title: '变动类型',
                dataIndex: 'type',
                render: (v: string) => types[v] ?? '历史记录',
              },
              { title: '原因', dataIndex: 'reason' },
              { title: '操作人员', dataIndex: 'actor' },
              {
                title: '关联订单',
                dataIndex: 'orderId',
                render: (v: string | null) => v ?? '无',
              },
            ]}
          />
        )}
      </section>
      {edit && (
        <InventoryEditor
          key={edit.row.id + edit.action}
          {...edit}
          close={() => setEdit(undefined)}
          saved={() => {
            setEdit(undefined);
            setNotice('库存操作已保存');
            refresh((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
function InventoryEditor({
  row,
  action,
  close,
  saved,
}: {
  row: Row;
  action: 'stock' | 'threshold' | 'sale';
  close: () => void;
  saved: () => void;
}) {
  const { api } = useCatalog();
  const [quantity, setQuantity] = useState<number | null>(1),
    [direction, setDirection] = useState(1),
    [threshold, setThreshold] = useState<number | null>(row.lowStockThreshold),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const request = useRef({ body: '', key: '' });
  const delta = (quantity ?? 0) * direction;
  const submit = async () => {
    if (!reason.trim()) {
      setError('请填写调整原因');
      return;
    }
    if (
      action === 'stock' &&
      (!Number.isInteger(quantity) ||
        !quantity ||
        quantity < 1 ||
        quantity > 2147483647 ||
        row.stockQuantity + delta < row.reservedQuantity ||
        row.stockQuantity + delta > 2147483647)
    ) {
      setError('调整后库存不能低于订单预占，也不能超出允许范围');
      return;
    }
    if (
      action === 'threshold' &&
      threshold !== null &&
      (!Number.isInteger(threshold) || threshold < 0 || threshold > 2147483647)
    ) {
      setError('预警数量须为零或正整数，也可清空');
      return;
    }
    const payload = {
      ...(action === 'stock'
        ? { delta }
        : action === 'threshold'
          ? { lowStockThreshold: threshold }
          : { soldOut: !row.soldOut }),
      reason: reason.trim(),
    };
    const body = JSON.stringify(payload);
    if (busy) return;
    if (request.current.body !== body) {
      // getRandomValues also works on trusted LAN HTTP, where randomUUID is unavailable.
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6]! & 15) | 64;
      bytes[8] = (bytes[8]! & 63) | 128;
      const hex = Array.from(bytes, (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      request.current = {
        body,
        key: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`,
      };
    }
    setBusy(true);
    setError('');
    try {
      await api(
        action === 'stock'
          ? '/variants/' + row.id + '/stock'
          : '/inventory/variants/' + row.id,
        action === 'stock' ? 'POST' : 'PATCH',
        { ...payload, idempotencyKey: request.current.key },
      );
      saved();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      title={
        action === 'stock'
          ? '调整库存'
          : action === 'threshold'
            ? '设置库存预警'
            : row.soldOut
              ? '确认恢复售卖'
              : '确认标记售罄'
      }
      onCancel={() => {
        if (!busy) close();
      }}
      onOk={() => void submit()}
      okText="确认提交"
      cancelText="取消"
      confirmLoading={busy}
      mask={{ closable: false }}
      closable={!busy}
      cancelButtonProps={{ disabled: busy }}
    >
      <p>
        {row.productName} · {row.name}
      </p>
      {error && <Alert type="error" title={error} showIcon />}
      <Form layout="vertical">
        {action === 'stock' && (
          <>
            <Form.Item label="调整方式（必填）">
              <Select
                value={direction}
                onChange={setDirection}
                options={[
                  { value: 1, label: '增加库存' },
                  { value: -1, label: '减少库存' },
                ]}
              />
            </Form.Item>
            <Form.Item label="调整数量（必填）">
              <InputNumber
                aria-label="调整数量（必填）"
                min={1}
                max={2147483647}
                precision={0}
                value={quantity}
                onChange={setQuantity}
              />
            </Form.Item>
            <Alert
              type="info"
              title={`确认：实际库存 ${row.stockQuantity} → ${row.stockQuantity + delta}；订单预占 ${row.reservedQuantity} 不变；可售数量 ${(row.available ?? 0) + delta}`}
            />
          </>
        )}
        {action === 'threshold' && (
          <>
            <Form.Item label="预警数量（选填，可清空）">
              <InputNumber
                aria-label="预警数量（选填，可清空）"
                min={0}
                max={2147483647}
                precision={0}
                value={threshold}
                onChange={setThreshold}
              />
            </Form.Item>
            <p className="muted">
              可售数量小于或等于此数值时提醒；未设置则不判断库存紧张。
            </p>
          </>
        )}
        {action === 'sale' && (
          <Alert
            type="warning"
            title={
              row.soldOut
                ? '恢复仅清除手动售罄标记；库存为零仍无法接新单。'
                : '标记后停止新销售，不修改已有订单或库存。'
            }
          />
        )}
        <Form.Item label="调整原因（必填）">
          <Input.TextArea
            aria-label="调整原因（必填）"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </Form.Item>
        <p className="muted">系统自动记录操作人员、时间和变更前后结果。</p>
      </Form>
    </Modal>
  );
}
