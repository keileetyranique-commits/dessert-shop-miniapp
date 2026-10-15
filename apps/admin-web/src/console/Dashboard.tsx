import { Button, Empty, Tag } from 'antd';
import {
  ArrowRightOutlined,
  ShoppingOutlined,
  WalletOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useCatalog } from './Data';
import { useSession } from './Session';
export function Dashboard() {
  const { products, categories } = useCatalog();
  const { stores, storeId } = useSession();
  const missing = products.filter(
    (p) => !p.variantRecords.some((v) => v.status === 'ACTIVE'),
  ).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">每一天，都更了解你的生意</span>
          <h1>门店工作台</h1>
          <p>
            {stores.find((s) => s.id === storeId)?.name}
            ，欢迎回来。先看看今天需要关注什么。
          </p>
        </div>
        <Tag color="cyan">门店经营概览</Tag>
      </div>
      <div className="metric-grid">
        {[
          { name: '今日营业额', icon: <WalletOutlined />, tone: 'blue' },
          { name: '今日订单', icon: <ShoppingOutlined />, tone: 'cyan' },
          { name: '待处理订单', icon: <ClockCircleOutlined />, tone: 'orange' },
          { name: '顾客 / 会员', icon: <TeamOutlined />, tone: 'green' },
        ].map((m) => (
          <section className="panel metric" key={m.name}>
            <span className={'metric-icon ' + m.tone}>{m.icon}</span>
            <p>{m.name}</p>
            <strong>—</strong>
            <small>相关业务接入后显示</small>
          </section>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel trend">
          <div className="section-heading">
            <h2>营业趋势</h2>
            <span className="muted">近 7 天</span>
          </div>
          <div className="chart-empty">
            <LineChartOutlined />
            <h3>经营趋势，即将在这里展开</h3>
            <p>暂无真实订单数据，暂不绘制营业曲线。</p>
          </div>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>经营提醒</h2>
            <Tag color={missing ? 'orange' : 'cyan'}>
              {missing ? '建议处理' : '商品准备'}
            </Tag>
          </div>
          <h3>
            {missing ? `${missing} 个商品尚无启用规格` : '先把门店菜单准备好'}
          </h3>
          <p className="muted">
            {missing
              ? '未启用规格会影响商品正常售卖，请检查商品售价与规格状态。'
              : `当前已录入 ${products.length} 个商品、${categories.length} 个分类，可继续完善商品图片和售价。`}
          </p>
          <Link to="/admin/products">
            <Button type="primary" icon={<ArrowRightOutlined />}>
              管理门店商品
            </Button>
          </Link>
          <div className="reminder-note">
            经营建议会基于真实资料逐步开放，关键改动始终由你确认。
          </div>
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>实时订单</h2>
            <Link to="/admin/orders">
              查看订单 <ArrowRightOutlined />
            </Link>
          </div>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无实时订单，订单功能尚未接入"
          />
        </section>
        <section className="panel">
          <div className="section-heading">
            <h2>热销商品排行</h2>
            <span className="muted">按真实销量统计</span>
          </div>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无销量数据，暂不生成热销排行"
          />
        </section>
      </div>
    </>
  );
}
