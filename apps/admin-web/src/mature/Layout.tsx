// Derived from jamezzh7/open-shop-wechat-template (ffa309206aea6a323493850cdf364ad0565b9fcd).
// Copyright (c) 2026 James Zhuang and Open Shop contributors. MIT; see public/third-party/open-shop-LICENSE.txt.
// Adapted for this project's visual-only merchant shell; no CloudBase or mutation APIs.
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useState } from 'react';

export const NAV = [
  { to: '/admin/dashboard', label: '首页' },
  { to: '/admin/products', label: '商品' },
  { to: '/admin/orders', label: '订单' },
  { to: '/admin/inventory', label: '库存' },
  { to: '/admin/marketing', label: '营销' },
  { to: '/admin/shipping', label: '配送' },
  { to: '/admin/analysis', label: '经营分析' },
  { to: '/admin/settings', label: '门店设置' },
];

const SHOP_NAME = '商家工作台';

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const current =
    NAV.find((item) => item.to === location.pathname)?.label ?? '首页';

  return (
    <div className="mature-admin flex min-h-screen">
      {mobileOpen && (
        <button
          aria-label="关闭导航遮罩"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
        />
      )}
      {/* Sidebar: retained from Open Shop, with a narrow-screen drawer. */}
      <aside
        id="merchant-navigation"
        className={`fixed inset-y-0 left-0 z-40 w-52 bg-white border-r border-[#E5E5E5] flex flex-col shrink-0 transition-transform md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="px-6 py-5 border-b border-[#E5E5E5]">
          <div
            className="mb-2 h-8 w-8 rounded-lg bg-primary text-white flex items-center justify-center font-semibold"
            aria-hidden="true"
          >
            店
          </div>
          <span className="text-base font-semibold text-[#1A1A1A]">
            {SHOP_NAME}
          </span>
        </div>
        <nav aria-label="商家后台导航" className="flex-1 py-4 px-3 space-y-0.5">
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-light text-primary font-medium'
                    : 'text-[#6B7280] hover:bg-[#F5F5F5] hover:text-[#1A1A1A]'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-[#E5E5E5]">
          <p className="px-3 text-xs text-[#6B7280] mb-2">
            界面预览 · 尚未连接经营数据
          </p>
          <a
            href="/legacy.html"
            className="block px-3 py-2 text-sm text-[#6B7280] hover:text-primary"
          >
            打开旧版后台 ↗
          </a>
        </div>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1 md:ml-52">
        <header className="h-16 px-4 md:px-8 bg-white border-b border-[#E5E5E5] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="打开导航"
              aria-expanded={mobileOpen}
              aria-controls="merchant-navigation"
              onClick={() => setMobileOpen(true)}
              className="md:hidden text-primary text-xl p-1"
            >
              ☰
            </button>
            <span className="text-sm text-[#6B7280]">
              商家后台 <span className="mx-2 text-[#D1D5DB]">/</span>{' '}
              <span className="text-[#1A1A1A]">{current}</span>
            </span>
          </div>
          <span className="rounded bg-primary-light px-3 py-1 text-xs text-primary">
            界面预览
          </span>
        </header>
        <main className="p-4 md:p-8 max-w-[1440px] mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
