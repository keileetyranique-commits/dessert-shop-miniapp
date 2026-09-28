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

## 第二步：真实商品只读接入

人工确认界面方向后，沿用 MIT 母体与现有请求客户端，增加内存登录状态、顶部授权门店选择和前端数据适配，不新增依赖。

读取现有 session、stores、categories、products 接口。Product.name/categoryId/imageUrl/status 映射到页面字段；有效规格限定未归档、ACTIVE、非负整数且不超过数据库金额上限。单规格显示准确人民币元，多规格取整数分最小值并显示“起”，无有效规格显示“待设置”。分类映射 id/name，继续使用原搜索和筛选。

接口映射与小型登录状态由本项目实现，因为必须匹配现有 NestJS Bearer/X-Store-Id 约定；未搬入上游 CloudBase 认证体系。共享请求客户端增加空响应、无效 JSON、网络、401/403/服务端错误处理，不显示原始服务端异常。切店清空旧数据并忽略旧请求；凭据不持久存储。

正常 HTTP(S) 图片直接显示（不附加后台凭据，禁发来源信息）；受保护 /api/ 媒体、危险协议、失败图片显示“暂无图片”。没有上传、写接口、数据库或权限变更，也未合入 PR #17。此前“未连接 API”的说明仅描述第一步历史状态。

## 第三步：已有商品图片

实际比较了 Open Shop 固定版本 `ffa309206aea6a323493850cdf364ad0565b9fcd` 的 `admin-web/src/pages/Products.tsx`、`admin-web/src/api/catalog.ts`，以及本项目 PR #17 固定版本 `356467754b9b60aa6419b6d43e5bbb76dcbb676b` 的图片模块。

- Open Shop：保留已迁入的编辑弹窗、图片区域位置、预览/选择/上传后保存交互和 Tailwind 风格。其 uploadProductImage 使用 CloudBase、时间戳加原始文件名；getImageUrl 使用临时公开地址；save 一并写商品多字段。本轮不复制这些 API 实现，改用本项目受保护媒体接口和独立图片保存。
- PR #17：实际迁入 media.controller.ts、image-validation.ts、storage.ts、image-validation.test.ts。保留 5 MiB、签名/MIME/扩展名/文件名、2000 万像素、静态单帧、sharp 旋转/缩放/去元数据/WebP 重编码、UUID 存储路径与目录边界。完成上传前再次检查完整商户/品牌/门店归属。商品引用校验单独迁入；受保护引用即便不变也核查归属。
- Prisma MediaAsset 与 AppModule 注册采用明确补丁；新迁移 202609210001_product_media 仅创建媒体表、租户复合外键、唯一存储键、租户索引、大小和 WebP MIME CHECK。未复制旧 merchant_ux migration，未修改旧迁移。
- PR #17 ImageUpload.tsx：复用其鉴权 Blob 读取/object URL 释放和 XMLHttpRequest 真实进度逻辑；不迁入 Ant Design 界面。ProductMedia.tsx 嵌入现有成熟弹窗，增加本地预览、卸载中止、中文错误与独立保存；media-client.ts 的商品 PATCH 仅构造 imageUrl。
- 新增 sharp 0.34.5（Apache-2.0）和 Express/Multer 类型声明（MIT），无新增前端依赖。sharp 的预编译依赖包含 libvips（LGPL-2.1-or-later），保留随包许可证；未复制、修改这些库源码。
- StorageAdapter 默认本地目录，可由 UPLOAD_DIR 配置；Docker 使用 uploads_data 持久卷。上传目录被 Git 和构建上下文忽略。移除只解除商品引用，原资产保留；未引用资产清理、配额、云存储适配器留待单独处理。

选择原因：成熟界面已经人工通过，CloudBase 与本项目权限模型不同；保留现有已验证的图片安全后端，比重做安全后端更合适。本轮未迁入门店归档、products/simple、默认规格或其他 PR #17 功能。此前“未接图片”说明仅记录第二步历史状态。

## 第四步：新增商品与基本资料编辑

继续改造已迁入的 Open Shop Products.tsx（固定版本 ffa309206aea6a323493850cdf364ad0565b9fcd，MIT），沿用表单、列表、弹窗和图片区域；没有重新设计页面或新增第三方依赖。

从本仓库 PR #17（356467754b9b60aa6419b6d43e5bbb76dcbb676b）局部复用 CatalogController.simpleProduct 和 localization.ts 的人民币字符串/BigInt 转换规则。只迁入简易商品原子创建，不引入其他 PR #17 功能。接口额外返回默认规格，前端直接更新列表。无新数据库迁移。

现有 ImageEditor 增加未绑定商品的草稿模式，仍用同一媒体上传客户端。前端 product-save.ts 为本项目权限和字段白名单做少量适配：增量商品字段、单规格售价独立保存、多规格只读和中文失败提示。这些适配由项目实现，原因是 Open Shop 的 CloudBase 全字段保存不符合本项目 NestJS 多租户和整数分协议。后端继续 CatalogAccess，未新增权限体系。

## Issue #19：整体采用 litemall 原版成熟基座

项目：linlinjava/litemall，GitHub：https://github.com/linlinjava/litemall，固定提交 a1ef964a718b7277925b19ea26afe78ea3a1d325，MIT。许可证复制在 vendor/litemall/LICENSE。实际整体复制八个模块（admin、admin-api、core、db、wx、wx-api、all、all-war）以及根构建/说明/许可证文件，共 1,210 个文件。原页面、路由、表格、表单、商品/分类/订单业务实现未重写；仅两份凭据配置做环境变量化，其余逐文件哈希保持原样。

选择原因：Issue #19 明确选定整体成熟中文商城作为基座，不再按按钮补 React 页面。保留原上游依赖，新增 Docker 工具链、依赖锁、独立环境初始化和真实 CRUD 验收，不向现有 pnpm 应用引入 Vue 或 Java 依赖。所有差异、来源清单、启动方式和重叠能力取舍见 BASELINE-MIGRATION-LITEMALL.md。TastyIgniter 本轮没有引入，也没有复制其代码。

## Issue #21：siam 原版餐饮商家端独立 baseline

实际整体复制 [siam1026/siam-server](https://github.com/siam1026/siam-server) 固定 SHA `0e418d6e8e1a607ae76fb2df054f2b6c8525eacd` 的完整 `vue-siam-shop` 与根 README、Apache-2.0 LICENSE，共 90 文件，存放于 `vendor/siam-server`。保留 package.json 原有 MIT 声明及所有第三方版权信息。页面、布局、路由、表单、表格和交互实际来自上游，未改写为 React。

选择原因：用户指定先体验原版餐饮商家后台。上游文件全部保持原样，Docker 构建副本仅适配地址、Sass/qs 依赖、大小写和外部集成隔离；使用独立测试 fixture 展示虚构数据，未部署完整 Java 业务。自研仅为无生产连接的演示数据适配和来源/隔离检查，避免为了视觉验收重建后端。新增依赖只在独立 Docker 内，不修改主工程依赖。具体文件、版本、功能边界和验收路线见 `BASELINE-MIGRATION-SIAM.md`。litemall 仅保留参考，本轮未修改其 UI。
