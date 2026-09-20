# Phase 1.1 第一步：成熟后台界面预览

这一步仅迁入 Open Shop 的 Layout、Dashboard、Products 与路由/样式，等待人工确认方向。

## 查看

在仓库根目录安装依赖并启动：

```sh
pnpm install --frozen-lockfile
pnpm --filter @platform/admin-web exec vite --host 127.0.0.1 --port 5175
```

- 首页：http://127.0.0.1:5175/admin/dashboard
- 商品：http://127.0.0.1:5175/admin/products
- 旧后台：http://127.0.0.1:5175/legacy.html

新界面不连接经营 API，因此预览不需要数据库、Docker 或访问凭据。旧后台仍需原有后端和登录流程。生产静态部署需对 `/admin/*` 回退到 index.html，并保留 legacy.html 独立入口。

## 人工检查范围

1. 固定侧栏、八个中文导航、顶部栏与独立内容区。
2. 首页四张数据卡片、趋势区域、待办/经营提示，均不伪造经营数据。
3. 商品搜索、分类筛选、六列表格、空状态，以及“新增商品”打开的编辑窗口。
4. 编辑窗口可试填字段，但保存和图片上传明确禁用，不会写数据。
5. 订单、库存、营销、配送、经营分析、门店设置显示“该功能将在后续阶段接入”。
6. 手机宽度的侧栏抽屉、卡片换行和表格横向滚动。

本轮没有真实商品查询、CRUD、上传、门店操作、成本改造、订单、支付、配送或 AI。不得将界面预览视为已上线的经营功能。

## 验证与来源

运行根目录 pnpm lint、pnpm typecheck、pnpm test、pnpm build，保留 Phase 0/1 原有测试，新增页面路由、空状态、过滤、弹窗和无写请求的测试。

源码范围、固定版本、MIT 许可证和必要适配见 [OPEN-SOURCE-REUSE.md](OPEN-SOURCE-REUSE.md)。
