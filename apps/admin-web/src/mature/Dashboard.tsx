// Derived from jamezzh7/open-shop-wechat-template (ffa309206aea6a323493850cdf364ad0565b9fcd).
// Copyright (c) 2026 James Zhuang and Open Shop contributors. MIT; see public/third-party/open-shop-LICENSE.txt.
// Adapted for this project's visual-only merchant shell; no CloudBase or mutation APIs.
import { Link } from 'react-router-dom';
function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#E5E5E5] p-6">
      <p className="text-sm text-[#6B7280] mb-1">{label}</p>
      <p className="text-2xl font-semibold text-[#1A1A1A]">{value}</p>
      {sub && <p className="text-xs text-[#6B7280] mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-[#1A1A1A]">首页</h1>
        <p className="text-sm text-[#6B7280] mt-1">
          经营概览，一眼了解门店的日常经营。
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="今日订单" value="—" sub="订单功能接入后显示" />
        <StatCard label="今日营收" value="—" sub="订单功能接入后显示" />
        <StatCard label="待处理订单" value="—" sub="暂无经营数据" />
        <StatCard label="待处理退款" value="—" sub="暂无经营数据" />
      </div>
      <div className="bg-white rounded-lg border border-[#E5E5E5] p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-[#1A1A1A]">本周营收（元）</h2>
          <span className="text-xs text-[#6B7280]">近 7 天</span>
        </div>
        <div className="h-[240px] flex flex-col items-center justify-center text-center rounded bg-[#FAFAFA] border border-dashed border-[#E5E5E5]">
          <p className="font-medium text-[#6B7280]">暂无经营数据</p>
          <p className="text-sm text-[#6B7280] mt-2 px-3">
            订单功能接入后将在这里显示今日经营情况与营收趋势
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-[#E5E5E5] p-6">
          <h2 className="text-sm font-medium mb-4">待办事项</h2>
          <p className="text-sm text-[#6B7280]">暂无待办数据</p>
          <p className="text-xs text-[#6B7280] mt-2">
            订单接入后，将在这里汇总需要处理的事项。
          </p>
        </div>
        <div className="bg-white rounded-lg border border-[#E5E5E5] p-6">
          <h2 className="text-sm font-medium mb-4">经营提示</h2>
          <p className="text-sm text-[#6B7280]">先查看商品管理界面</p>
          <p className="text-xs text-[#6B7280] mt-2 mb-4">
            本次可查看页面布局与编辑窗口，暂不保存业务数据。
          </p>
          <Link
            className="text-sm text-primary hover:underline"
            to="/admin/products"
          >
            查看商品管理 →
          </Link>
        </div>
      </div>
    </div>
  );
}
