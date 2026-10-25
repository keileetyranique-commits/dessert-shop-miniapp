import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
} from 'antd';
import { fen, formatFen } from '@platform/shared';
import { useCatalog } from './Data';

export interface OrderView {
  id: string;
  orderStatus: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  mode: string;
  payableFen: number;
  issue: string;
  createdAt: string;
  version: number;
  snapshot: {
    lines: {
      productName: string;
      variantName: string;
      quantity: number;
      modifiers: { name: string }[];
    }[];
  };
  events?: { id: string; action: string; createdAt: string }[];
}
export const orderLabels: Record<string, string> = {
  PENDING_PAYMENT: '待付款',
  AWAITING_ACCEPTANCE: '待接单',
  PREPARING: '制作中',
  READY: '待取餐 / 待配送',
  IN_DELIVERY: '配送中',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
  EXCEPTION: '异常待处理',
};
const paymentLabels: Record<string, string> = {
  UNPAID: '未付款',
  PAID: '已模拟付款',
  FAILED: '付款失败',
  REFUNDED: '已模拟退款',
};
const modes: Record<string, string> = {
  PICKUP: '到店自取',
  DINE_IN: '堂食',
  DELIVERY: '配送',
};
export const actionLabels: Record<string, string> = {
  CREATE: '创建订单',
  PAY: '模拟付款',
  PAY_FAIL: '模拟付款失败',
  ACCEPT: '接单制作',
  REJECT: '拒单退款',
  READY: '出餐叫号',
  DISPATCH: '模拟发配送',
  DRIVER_ACCEPT: '模拟骑手接单',
  DRIVER_FAIL: '模拟骑手未接单',
  DELIVERED: '模拟送达',
  PICKUP: '确认已取餐',
  CANCEL: '取消订单',
  EXPIRE: '超时关闭',
  RECOVER_CANCEL: '异常终止并模拟退款',
  REQUOTED: '重新获取配送报价',
  QUOTE_CHANGED: '模拟配送报价变化',
};
export function orderActions(order: OrderView) {
  if (order.orderStatus === 'PENDING_PAYMENT') return ['PAY', 'CANCEL'];
  if (order.orderStatus === 'AWAITING_ACCEPTANCE') return ['ACCEPT', 'REJECT'];
  if (order.orderStatus === 'PREPARING') return ['READY'];
  if (order.orderStatus === 'IN_DELIVERY') return ['DELIVERED'];
  if (order.orderStatus === 'READY')
    return order.mode !== 'DELIVERY'
      ? ['PICKUP']
      : order.fulfillmentStatus === 'DISPATCHING'
        ? ['DRIVER_ACCEPT']
        : ['DISPATCH'];
  return [];
}
export const orderMoney = (n: number) => '¥' + formatFen(fen(n));
const time = (value: string) =>
  new Date(value).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  });

export function Orders() {
  const { api, canEdit } = useCatalog();
  const [orders, setOrders] = useState<OrderView[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1);
  const [status, setStatus] = useState(''),
    [search, setSearch] = useState(''),
    [error, setError] = useState('');
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(''),
    [notice, setNotice] = useState('');
  const [detail, setDetail] = useState<OrderView | null>(null);
  const keys = useRef(new Map<string, string>());
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    try {
      const query = new URLSearchParams({
        page: String(page),
        ...(status ? { status } : {}),
        ...(search ? { search } : {}),
      });
      const result = await api<{ items: OrderView[]; total: number }>(
        '/orders?' + query,
      );
      if (!Array.isArray(result.items))
        throw Error('订单数据暂时无法读取，请稍后重试');
      if (generation.current === current) {
        setOrders(result.items);
        setTotal(result.total);
        setError('');
      }
    } catch (e) {
      if (generation.current === current)
        setError(e instanceof Error ? e.message : '订单暂时无法加载');
    } finally {
      if (generation.current === current) setLoading(false);
    }
  }, [api, page, search, status]);
  useEffect(() => {
    if (!canEdit) {
      setLoading(false);
      return;
    }
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      await load();
      running = false;
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    const online = () => void refresh();
    window.addEventListener('online', online);
    return () => {
      clearInterval(timer);
      generation.current++;
      window.removeEventListener('online', online);
    };
  }, [load, canEdit]);
  async function showDetail(id: string) {
    try {
      setDetail(await api<OrderView>('/orders/' + id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '订单详情暂时无法加载');
    }
  }
  async function act(order: OrderView, action: string) {
    if (busy) return;
    const key = order.id + ':' + action;
    if (!keys.current.has(key)) keys.current.set(key, crypto.randomUUID());
    setBusy(order.id);
    setNotice('');
    try {
      const updated = await api<OrderView>(
        `/orders/${order.id}/actions`,
        'POST',
        { action, idempotencyKey: keys.current.get(key) },
      );
      keys.current.delete(key);
      setNotice(`${actionLabels[action]}已完成`);
      if (detail?.id === order.id) setDetail(updated);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作未完成，请刷新核对后重试');
    } finally {
      setBusy('');
    }
  }
  function confirm(order: OrderView, action: string) {
    if (['CANCEL', 'REJECT'].includes(action))
      Modal.confirm({
        title: `确认${actionLabels[action]}？`,
        content: '会关闭测试订单、释放预占库存；已模拟付款将模拟退款。',
        okText: '确认操作',
        cancelText: '返回',
        onOk: () => act(order, action),
      });
    else void act(order, action);
  }
  if (!canEdit)
    return (
      <Alert
        type="warning"
        title="当前角色不能处理订单，请使用老板或店长账号"
      />
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>门店订单</h1>
          <p>接单、制作与出餐，一处处理。每 5 秒更新，断线后自动重连。</p>
        </div>
        <Button onClick={() => void load()}>刷新订单</Button>
      </div>
      <Alert
        type="info"
        showIcon
        title="仅模拟 · 测试订单不计入真实营业额，不产生真实收款或配送"
      />
      {error && (
        <Alert
          type="error"
          showIcon
          title={error}
          description="连接异常时请勿重复操作；恢复后先核对订单，重试会沿用同一操作编号。"
        />
      )}
      {notice && (
        <Alert
          type="success"
          title={notice}
          closable
          onClose={() => setNotice('')}
        />
      )}
      <section className="panel">
        <Tabs
          activeKey={status}
          onChange={(key) => {
            setStatus(key);
            setPage(1);
          }}
          items={[
            { key: '', label: '全部' },
            ...Object.entries(orderLabels).map(([key, label]) => ({
              key,
              label,
            })),
          ]}
        />
        <Input.Search
          aria-label="搜索订单"
          placeholder="完整订单号或下单人员"
          allowClear
          onSearch={(value) => {
            setSearch(value.trim());
            setPage(1);
          }}
          style={{ maxWidth: 420, marginBottom: 20 }}
        />
        <Table<OrderView>
          rowKey="id"
          dataSource={orders}
          loading={loading}
          scroll={{ x: 850 }}
          locale={{
            emptyText: (
              <Empty
                description={
                  error ? '连接恢复后显示订单' : '暂无符合条件的测试订单'
                }
              />
            ),
          }}
          pagination={{
            current: page,
            total,
            pageSize: 50,
            showSizeChanger: false,
            onChange: setPage,
          }}
          columns={[
            {
              title: '订单 / 下单时间',
              key: 'id',
              render: (_, row) => (
                <>
                  <Button type="link" onClick={() => void showDetail(row.id)}>
                    {row.id.slice(-8)}
                  </Button>
                  <div className="muted">{time(row.createdAt)}</div>
                </>
              ),
            },
            {
              title: '商品',
              key: 'items',
              render: (_, row) =>
                row.snapshot.lines.map((line, i) => (
                  <div key={i}>
                    {line.productName} × {line.quantity}
                  </div>
                )),
            },
            {
              title: '履约',
              dataIndex: 'mode',
              render: (value) => modes[value] ?? '待确认',
            },
            { title: '测试金额', dataIndex: 'payableFen', render: orderMoney },
            {
              title: '状态',
              key: 'state',
              render: (_, row) => (
                <>
                  <Tag
                    color={
                      row.issue
                        ? 'orange'
                        : row.orderStatus === 'COMPLETED'
                          ? 'green'
                          : 'blue'
                    }
                  >
                    {orderLabels[row.orderStatus] ?? '待核对'}
                  </Tag>
                  <div className="muted">
                    {row.issue || paymentLabels[row.paymentStatus]}
                  </div>
                </>
              ),
            },
            {
              title: '操作',
              key: 'actions',
              render: (_, row) => (
                <Space wrap>
                  {orderActions(row).map((action) => (
                    <Button
                      key={action}
                      loading={busy === row.id}
                      disabled={!!busy}
                      onClick={() => confirm(row, action)}
                    >
                      {actionLabels[action]}
                    </Button>
                  ))}
                  <Button type="text" onClick={() => void showDetail(row.id)}>
                    详情
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </section>
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title="测试订单详情"
        size="large"
      >
        {detail && (
          <>
            <Descriptions
              column={1}
              items={[
                { key: 'id', label: '订单号', children: detail.id },
                {
                  key: 'state',
                  label: '当前进度',
                  children: orderLabels[detail.orderStatus],
                },
                {
                  key: 'payment',
                  label: '付款',
                  children: paymentLabels[detail.paymentStatus],
                },
                {
                  key: 'amount',
                  label: '测试应付',
                  children: orderMoney(detail.payableFen),
                },
                {
                  key: 'mode',
                  label: '履约方式',
                  children: modes[detail.mode],
                },
              ]}
            />
            {detail.snapshot.lines.map((line, i) => (
              <p key={i}>
                {line.productName} · {line.variantName} × {line.quantity}
                {line.modifiers.map((m) => ' / ' + m.name).join('')}
              </p>
            ))}
            {detail.issue && <Alert type="warning" title={detail.issue} />}
            <h3>处理记录</h3>
            <Timeline
              items={
                detail.events?.map((event) => ({
                  key: event.id,
                  content: `${time(event.createdAt)} · ${actionLabels[event.action] ?? '订单处理记录'}`,
                })) ?? []
              }
            />
          </>
        )}
      </Drawer>
    </>
  );
}
