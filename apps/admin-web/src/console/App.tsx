import { useEffect, useState } from 'react';
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import {
  Alert,
  Button,
  ConfigProvider,
  Empty,
  Input,
  Select,
  Tabs,
  Tag,
} from 'antd';
import zhCN from 'antd/locale/zh_CN';
import {
  ShopOutlined,
  AppstoreOutlined,
  ShoppingOutlined,
  InboxOutlined,
  GiftOutlined,
  CarOutlined,
  TeamOutlined,
  LineChartOutlined,
  SettingOutlined,
  LogoutOutlined,
} from '@ant-design/icons';
import {
  SessionProvider,
  StoreSwitch,
  useSession,
  CreateStore,
} from './Session';
import { StoreGate } from './Data';
import { Dashboard } from './Dashboard';
import { Products } from './Products';
import './console.css';
const navigation = [
  ['', '工作台', AppstoreOutlined],
  ['orders', '订单', ShoppingOutlined],
  ['products', '商品', ShopOutlined],
  ['inventory', '库存', InboxOutlined],
  ['marketing', '营销', GiftOutlined],
  ['delivery', '配送', CarOutlined],
  ['members', '会员', TeamOutlined],
  ['analysis', '经营分析', LineChartOutlined],
  ['settings', '门店设置', SettingOutlined],
] as const;
export function ConsoleApp() {
  return (
    <ConfigProvider
      locale={zhCN}
      button={{ autoInsertSpace: false }}
      theme={{
        token: {
          colorPrimary: '#147d92',
          colorInfo: '#147d92',
          colorSuccess: '#219c75',
          colorWarning: '#ed9742',
          borderRadius: 12,
          fontFamily: 'Inter, "Microsoft YaHei", sans-serif',
          controlHeight: 40,
        },
        components: {
          Modal: { borderRadiusLG: 20 },
          Button: { primaryShadow: 'none' },
        },
      }}
    >
      <BrowserRouter>
        <SessionProvider>
          <Shell />
        </SessionProvider>
      </BrowserRouter>
    </ConfigProvider>
  );
}
function Shell() {
  const session = useSession();
  const location = useLocation();
  return (
    <div className="console">
      <aside className="sidebar">
        <NavLink to="/admin" className="brand">
          <span>
            <ShopOutlined />
          </span>
          <strong>门店工作台</strong>
        </NavLink>
        <nav aria-label="主导航">
          {navigation.map(([path, label, Icon]) => (
            <NavLink end to={'/admin' + (path ? '/' + path : '')} key={path}>
              <Icon />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> 专注门店日常经营
        </div>
      </aside>
      <div className="console-main">
        <header className="topbar">
          <div className="breadcrumb">
            商家中心 <span>/</span>{' '}
            {navigation.find(
              ([p]) => location.pathname === '/admin' + (p ? '/' + p : ''),
            )?.[1] ?? '工作台'}
          </div>
          <div className="actions">
            <StoreSwitch />
            <Button
              type="text"
              icon={<LogoutOutlined />}
              onClick={() => session.logout()}
            >
              退出
            </Button>
          </div>
        </header>
        <div className="workspace">
          <RuntimeBanner />
          <StoreGate>
            <Routes>
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/products" element={<Products />} />
              <Route path="/admin/orders" element={<Orders />} />
              {navigation
                .filter(([p]) => !['', 'products', 'orders'].includes(p))
                .map(([p, label]) => (
                  <Route
                    key={p}
                    path={'/admin/' + p}
                    element={
                      <Placeholder title={label} settings={p === 'settings'} />
                    }
                  />
                ))}
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </StoreGate>
        </div>
      </div>
    </div>
  );
}
function RuntimeBanner() {
  const [mode, setMode] = useState('正在确认运行模式…');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/v1/runtime', { signal: controller.signal, cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const v = await r.json();
        if (typeof v.testMode !== 'boolean') throw Error();
        setMode(v.testMode ? '测试模式 · 不产生真实交易' : '正式模式');
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMode('运行模式暂时无法确认，请联系管理员');
      });
    return () => controller.abort();
  }, []);
  return <div className="runtime-line">{mode}</div>;
}
function Orders() {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>门店订单</h1>
          <p>从接单到出餐，集中处理门店订单。</p>
        </div>
      </div>
      <section className="panel">
        <Alert
          type="info"
          showIcon
          title="订单功能将在后续阶段接入，当前没有可执行的订单操作"
        />
        <Tabs
          items={['全部', '待接单', '待制作', '待配送', '已完成', '已取消'].map(
            (label) => ({ key: label, label }),
          )}
        />
        <div className="filters">
          <Input placeholder="搜索订单号或顾客" disabled />
          <Select placeholder="配送方式" disabled />
          <Input type="date" aria-label="订单日期" disabled />
        </div>
        <Empty description="暂无真实订单数据" />
      </section>
    </>
  );
}
function Placeholder({
  title,
  settings = false,
}: {
  title: string;
  settings?: boolean;
}) {
  const s = useSession();
  const store = s.stores.find((x) => x.id === s.storeId);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>
          <p>
            {settings ? '门店资料与协作设置' : '结论、趋势与行动，逐步汇集于此'}
          </p>
        </div>
      </div>
      <section className="panel blank-page">
        {settings ? (
          <>
            <ShopOutlined className="large-icon" />
            <h2>{store?.name}</h2>
            <Tag color="green">营业中</Tag>
            <p>
              {store?.timezone === 'Asia/Shanghai'
                ? '中国标准时间（北京时间）'
                : '按门店配置的当地时间'}
            </p>
            <p className="muted">{store?.address || '暂未填写地址'}</p>
            <CreateStore />
            <p className="muted">店员、权限与设备管理将在此处逐步接入。</p>
          </>
        ) : (
          <Empty description="该功能将在后续阶段接入" />
        )}
      </section>
    </>
  );
}
