# Phase 1.1：C 方案商家工作台

对应 [Issue #23](https://github.com/keileetyranique-commits/dessert-shop-miniapp/issues/23)。从 main 的 `52d360551e0b9a80da13630457231851de867aec` 创建 `phase-1-1-c-merchant-console`。不合并 PR #18、#20、#22，不进入 Phase 2。

## 交付范围

- 默认入口 `/admin`：浅灰背景、固定窄导航、白色圆角卡片、蓝青主色。顶部切换真实授权门店。
- 工作台保留今日营业额、订单、待处理、顾客、营业趋势、实时订单、热销商品和经营提醒。订单/会员接口尚未实现，明确显示暂无数据；商品提醒来自当前门店真实商品，不使用演示营业额或销量。
- `/admin/products`：真实列表、中文状态、名称/描述/分类搜索、分类筛选、在售/下架/售罄筛选、商品卡片。
- 商品新增一次事务建立商品和默认规格；编辑基本资料、图片与单规格价格；多个有效规格分别到规格管理编辑，不覆盖全部价格。
- 分类新增、修改名称、归档；分类仍有关联商品时拒绝归档。商品、规格归档二次确认，保留历史数据。
- 规格支持新增、编辑和归档；通用附加选项支持新建组、新增/编辑/停用选项。现有后端没有组修改/删除接口，页面明确说明，不提供伪成功按钮。
- 图片支持选择/拖拽、预览、进度、更换、移除；取消系统选图保持表单。上传成功仅改变草稿，保存商品才绑定图片。
- 订单提供状态页框架，库存、营销、配送、会员、经营分析显示后续接入说明；门店设置展示真实门店并允许品牌负责人创建门店。没有真实订单、支付、库存调整、成本 UI 或 AI。

## 启动与人工检查

Docker Desktop 运行后执行 `pnpm dev`，访问 http://localhost:5173/admin。输入本机 `.env` 中 `ADMIN_IDENTITIES` 对应的 token；不得将凭据发到聊天、日志或提交到仓库。凭据仅保存在浏览器内存，刷新后重新登录。

单店自动选择，多店通过顶部选择，无门店时显示明确空状态；品牌级 OWNER 可创建门店。新建门店默认北京时间和营业中。人工检查：创建分类 → 新增商品（元、图片）→ 编辑 → 管理规格/附加选项 → 上下架 → 归档；同时检查另一个门店不会出现原门店图片和表单。

## 后端、安全和迁移

选择性移植 PR #18 的媒体校验、StorageAdapter、媒体 Controller、商品图片归属校验、`products/simple` 及其测试，没有带入旧后台页面或 baseline。

新增迁移 `202609210001_product_media` 建立 `media_assets`，包含完整 Merchant/Brand/Store 归属、复合外键、服务端存储 key、大小/尺寸/MIME 约束和门店索引。已落地的旧迁移未修改。分类归档复用现有 deletedAt，无额外字段。

图片只接受不超过 5 MB 的静态 JPG/PNG/WebP，校验文件名、扩展名、MIME、签名、解码、单帧和像素上限；sharp 自动旋转、限制尺寸、去元数据并重编码 WebP。UUID 生成文件名，拒绝路径穿越，原文件不保存。开发存储使用 Docker `uploads_data` 持久卷；适配器允许后续替换对象存储。备份数据库时需同时备份图片卷。

受保护图片通过 Bearer + X-Store-Id 读取 Blob，创建 object URL 并在换图/切店/卸载时释放。公开 HTTP(S) 历史图片可读取；新绑定必须使用本店媒体。更换/取消新增可能留下孤立媒体，本轮不做自动清理。

| 能力                             | OWNER        | MANAGER | COST_MANAGER |
| -------------------------------- | ------------ | ------- | ------------ |
| 读取授权门店商品和媒体           | 是           | 是      | 是           |
| 商品、分类、规格、选项写入和上传 | 是           | 是      | 否           |
| 成本 API                         | 是           | 否      | 是           |
| 创建门店                         | 仅品牌级授权 | 否      | 否           |

后端 CatalogAccess 为最终权限边界；不新增开发鉴权旁路。金额用十进制字符串 + BigInt 精确转换，限制为数据库整数范围。编辑商品与规格售价沿用两个接口，后者失败会明确提示部分保存，不宣称整体成功。分类归档使用事务，非空分类返回 409。

## 验收命令

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm db:migrate
pnpm db:migrate
pnpm test:integration
pnpm dev
node scripts/smoke.mjs
```

测试数据库必须独立，APP_ENV=test 且库名含 test。CI 的 checks、compose 分别运行完整检查和一键启动。截图和最终运行结果随 PR 提供；本文件不将未执行的检查视为通过。

## 页面实测与边界

已通过本地真实 API 验证分类新增、商品新增、默认规格生成、多规格独立售价、附加选项组和选项保存。验收数据明确以“验收”命名，只存在本机开发库，未加入源码或生产初始化。截图的商品页使用搜索过滤，不展示原有私人图片。

- [工作台截图](screenshots/c-console/dashboard.png)
- [商品页截图](screenshots/c-console/products.png)
- [编辑弹窗截图](screenshots/c-console/product-editor.png)
- [小屏截图](screenshots/c-console/products-mobile.png)

分类归档与商品创建/分类修改均使用 Serializable 事务，冲突返回 409，避免并发产生已归档分类下的活动商品。保留媒体孤立文件清理、选项组编辑/删除和正式订单指标为后续事项。当前前端产物约 917 kB（压缩传输约 299 kB），构建有大文件提示但不影响通过；后续模块增长时应按路由拆包。
