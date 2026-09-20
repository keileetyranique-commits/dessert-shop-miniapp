// Derived from jamezzh7/open-shop-wechat-template (ffa309206aea6a323493850cdf364ad0565b9fcd).
// Copyright (c) 2026 James Zhuang and Open Shop contributors. MIT; see public/third-party/open-shop-LICENSE.txt.
// Adapted for this project's visual-only merchant shell; no CloudBase or mutation APIs.
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout, { NAV } from './Layout';
import Dashboard from './Dashboard';
import Products from './Products';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-[#1A1A1A]">{title}</h1>
      <div className="bg-white rounded-lg border border-[#E5E5E5] p-12 text-center">
        <p className="text-base text-[#1A1A1A]">该功能将在后续阶段接入</p>
        <p className="text-sm text-[#6B7280] mt-2">
          当前仅提供页面入口，暂无可操作的业务功能。
        </p>
      </div>
    </div>
  );
}
export function MerchantRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/admin" element={<Layout />}>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        {NAV.slice(2).map((item) => (
          <Route
            key={item.to}
            path={item.to.split('/').pop()}
            element={<Placeholder title={item.label} />}
          />
        ))}
        <Route path="*" element={<Placeholder title="页面暂不可用" />} />
      </Route>
      <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
    </Routes>
  );
}
export default function App() {
  return (
    <BrowserRouter>
      <MerchantRoutes />
    </BrowserRouter>
  );
}
