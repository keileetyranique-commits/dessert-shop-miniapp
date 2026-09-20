# 开源复用记录

## Phase 1.1 第一步：成熟商家后台界面母体

本轮**实际复制并改造 Open Shop 源码**，不是仅参考后自行重画。来源：

- 项目：[jamezzh7/open-shop-wechat-template](https://github.com/jamezzh7/open-shop-wechat-template)
- 固定提交：`ffa309206aea6a323493850cdf364ad0565b9fcd`
- 许可证：MIT，Copyright (c) 2026 James Zhuang and Open Shop contributors。
- 已读取并保留完整 LICENSE 于 `apps/admin-web/public/third-party/open-shop-LICENSE.txt`，随生产构建发布。
- 迁移目标目录：`apps/admin-web/src/mature/`。

| 原始文件/组件                       | 实际复制内容                                                                                                           | 当前适配                                                                                                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| admin-web/src/components/Layout.tsx | flex 侧栏/内容结构、NavLink 高亮逻辑、导航和底部入口的 Tailwind 类                                                     | 八个中文导航；去除 CloudBase 退出；补充顶部栏、手机抽屉及旧后台入口                                                                                        |
| admin-web/src/App.tsx               | BrowserRouter + Routes/Route + Navigate + Layout/Outlet 嵌套路由                                                       | 新路径 /admin/*；首页和商品页面，其他六个入口仅占位；不搬 CloudBase ProtectedRoute                                                                         |
| admin-web/src/pages/Dashboard.tsx   | StatCard 源码、标题、四卡片网格、本周营收容器、配色和间距                                                              | 缺少订单数据时显示破折号/明确空状态；删除统计 API 和无数据图表绘制；增加同款卡片的待办与提示区域                                                           |
| admin-web/src/pages/Products.tsx    | ProductsTab 的工具栏、表格、编辑弹窗结构；SearchBar、TableStateRow、Modal、Field、inputCls、搜索过滤逻辑及状态标签样式 | 仅迁移商品页子集；去除分类/规格 CRUD、推荐、CloudBase、全局及 localStorage 数据缓存；增加分类筛选、图片列、整数分格式化的售价列；编辑窗口保存/上传明确禁用 |
| admin-web/src/index.css             | Tailwind 引入、紫色主题变量、字体、背景和正文颜色                                                                      | 限定扫描到 mature 目录；补充键盘焦点和弹窗遮罩；旧 CSS 只由 legacy.html 加载                                                                               |

新增依赖：react-router-dom 7.15.1、tailwindcss 4.3.0、@tailwindcss/vite 4.3.0，均为 MIT，版本由 pnpm 锁文件固定。沿用上游同类依赖，不复制 CloudBase SDK、后端、认证、图片素材或支付代码；没有新增 Refine、Ant Design 或图表库。

### 边界与选择理由

用户指定 Open Shop 为母体，技术栈接近，本轮不再搜索其他后台方案。新增代码只承担入口适配、响应式、空状态和预览禁用，不新增领域逻辑。

商品数据刻意不连接：现有 API 需要凭据和门店选择，连同 CRUD 一起接入会扩大本轮范围。运行页面不请求经营 API，不内置任何示例商品、订单、营收或销量。测试夹具仅存在测试文件中。

Modal 保留原布局与样式，用原生 dialog 增加焦点约束和 Escape 关闭；字段补上关联标签。售价编辑值保留字符串，尚不发送写请求。表格的整数分显示使用项目现有 helper。

本轮基于 main `52d3605` 新建独立分支，旧 AdminPanel/Editor/StoreWorkspace 与后端保持原样，旧后台暂留 `/legacy.html`。没有引入 PR #17 的迁移或存储改动；下一步是否合并安全上传等能力由人工验收后决定。

构建产物：新入口 JavaScript 约 53 KB（gzip 18 KB），共享 React 运行时约 224 KB（gzip 70 KB），新样式约 14 KB（gzip 4 KB）；旧入口单独打包，不混入新页面样式。无服务器、数据库和权限变化。
