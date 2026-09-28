# siam 原版餐饮商家端独立验收（Issue #21）

本轮直接运行原版 `vue-siam-shop`，没有重新设计布局、菜单、商品/分类/订单页面，也没有把 Vue 改成 React。现有 React/NestJS/Postgres 和 litemall 均保持独立。PR #18 不修改，PR #20 不合并；新分支 `codex/siam-shop-baseline` 从 PR #20 的 `6c1acc4` 分出，仅增加 siam 验收环境。

## 来源与许可证

- 上游：[siam1026/siam-server](https://github.com/siam1026/siam-server)。
- 固定 SHA：`0e418d6e8e1a607ae76fb2df054f2b6c8525eacd`。
- 原样复制：完整 `vue-siam-shop/`，以及仓库根 `LICENSE`、`README.md`，共 90 个文件，位于 `vendor/siam-server/`。
- Apache-2.0 原文：`vendor/siam-server/LICENSE`，未删除上游版权或其他许可声明。商家端 `package.json` 自身写有 MIT，原样保留该声明；本次来源按仓库根 Apache-2.0 记录，第三方依赖保留各自许可证。
- `deploy/siam/upstream-files.json` 记录固定归档 SHA-256 及逐文件摘要；`node deploy/siam/verify.mjs` 验证所有复制文件未改动。

## 启动、登录和数据重置

仓库根目录执行：

```sh
docker compose -f deploy/siam/compose.yml up -d --build
node deploy/siam/smoke.mjs
```

打开 **http://localhost:18081/#/login**。

演示账号：**demo**；演示密码：**demo123**。这是公开的虚构账号，不是任何真实商家凭据；不要输入真实账号密码。登录表单、前端校验、跳转和会话存储沿用原版，验证账号的服务是隔离 fixture，不是真实上游鉴权。

停止：`docker compose -f deploy/siam/compose.yml down`。

演示编辑只保存在该容器进程内存，刷新页面保留，重启容器恢复样例；重启后重新登录。无需安装 Java、MySQL、Vue 工具链。没有访问或修改现有数据库，也没有新增 Prisma migration。

## 为什么这轮使用 fixture

实际检查了固定版本的根 README、Maven 模块、后端 `application-local.yml` 和 SQL：仓库**确实包含** `sql/mysql/siam_db.sql`，有商品、分类、门店等种子数据，不能称为“完全没有 SQL”。README 同时保留另行获取 SQL/部分客户端资料的说明。

完整 Java 工程还包含 MySQL、Redis、MongoDB、消息队列及外部支付、短信、存储、打印等依赖/配置；当前没有为这些服务配置完整独立环境与可用外部凭据。本轮为限定的视觉/流程验收采用 Issue #21 明确允许的隔离 fixture，**没有尝试把所有外部业务服务完整部署，也没有证明完整 Java 后端无法部署；不声称完整后端已跑通**。

没有导入上游 SQL 的商家个人资料或凭据，所有展示数据都是新建的虚构样例。此适配层只回答页面展示所需的数据协议，不替代未来 NestJS 安全业务实现。

## 最小构建适配清单

vendor 90 个文件保持逐字节一致。`deploy/siam/adapt-build.mjs` 只修改 Docker 内一次性构建副本：

| 构建副本文件                            | 适配原因与范围                                                                                                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`、`package-lock.json`     | 上游旧淘宝下载地址证书已失效，改用 npm 官方下载源；以 Sass 1.32.13 + sass-loader 7.3.1 替换旧 node-sass 本地编译链，补齐源码已经使用但未声明的 qs 6.14.0；最终依赖锁在 deploy/siam/package-lock.json，容器使用 npm ci。 |
| `webpack.config.js`                     | 指定 Dart Sass 实现，原样编译原版样式。                                                                                                                                                                                 |
| `config/index.js`                       | API 改为同源 /siam-server；对象存储改为本地 fixture-media；收银台外链改为演示边界说明。                                                                                                                                 |
| `src/routes.js`                         | 原版 login.vue 导入与实际 Login.vue 大小写不一致，只修 Linux 导入路径，不改变任何路由定义。                                                                                                                             |
| `src/pages/Home.vue`                    | 仅将远程头像地址替换为上游已有 static/user.png；布局、菜单、开关交互不变。                                                                                                                                              |
| `src/components/internal/orderPrint.js` | 在演示构建内替换成不执行的接口适配，禁止原定时器连接远程 WebSocket 和真实打印服务；打印机页面未改。                                                                                                                     |
| `index.html`                            | 增加固定底部标识“独立视觉验收 / 全部数据为本地演示”，不替换原版页面。                                                                                                                                                   |

没有新增前端框架。新增 Node HTTP fixture 服务只用于 baseline；这是与上游数据协议匹配的测试适配，不是自研商家界面。

## 可浏览页面与验收路线

登录后使用原版左侧导航：

| 页面          | 原版路径                                                      | 本地演示数据及可体验内容                                                             |
| ------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 数据中心      | /statisticGraph                                               | 今日订单、收入、访客、加购、待办、商品总览、客单价、转化率、订单趋势。所有数字虚构。 |
| 今日订单      | /todayOrderList                                               | 取餐号、商品描述、联系人、金额和状态列表。                                           |
| 自取订单      | /forHereOrderList                                             | 待制作、待自取、完成、取消、全部订单标签页。                                         |
| 外卖订单      | /takeOutOrderList                                             | 待配送、已配送、完成、取消、全部订单标签页。                                         |
| 售后处理      | /refundOrderList                                              | 演示退款申请及订单详情入口，不会真实退款。                                           |
| 分类管理      | /menuList                                                     | 饮品、轻食、季节分类，原版查询、增加、编辑、删除弹窗；编辑仅写内存。                 |
| 商品列表      | /goodsList                                                    | 4 个样例商品，价格、分类、状态和原版操作入口。                                       |
| 新增/编辑商品 | /addGoods、/editGoods?id=1                                    | 原版商品表单、图片选择/裁剪、打印机选择；保存只改变内存 fixture。                    |
| 满减          | /fullReductionRuleList                                        | 午间满减示例和原版编辑弹窗。                                                         |
| 优惠券        | /couponsList                                                  | 演示优惠券与原版商品选择、有效期表单。                                               |
| 门店管理      | /shopInfo、/shopInfoImportant                                 | 营业时间、公告、门店地址和原版门店资料表单。                                         |
| 打印机        | /ticketPrinterList、/labelPrinterList                         | 后厨小票机、饮品标签机的演示记录及原版编辑表单；不会打印。                           |
| 财务报表      | /accountInfo、/merchantBillingRecord、/merchantWithdrawRecord | 虚构可提现余额、入账/支出和提现记录；真实提现请求拒绝执行。                          |

先浏览整体导航，再进入商品列表点击“新增”和“修改商品”，进入分类页面点击“新增/编辑”，检查原版表格、筛选和表单体验。不要把演示保存成功理解成生产业务已实现。

## 原版逻辑与 mock 边界

**真实运行的上游代码**：Vue 2 + Element UI 页面渲染、布局、路由、分页控件、表单校验、弹窗、图片选择/裁剪、标签页、图表及 HTTP 客户端。没有手写替代这些页面。

**仅 baseline mock**：登录账号校验、商家/门店、商品/分类、订单/售后、统计、活动/优惠券、打印机、账单/提现记录全部来自 `fixtures.mjs`。商品、分类、满减、优惠券的演示修改仅存内存。金额沿用上游元协议用于展示，不是现有整数 Fen 生产接口。

**上传的限制**：原版图片选择/裁剪仍执行；fixture 接收后丢弃文件字节，只返回本地“演示商品”占位图，不提供真实媒体存储，也不声称已迁入安全上传后端。

**未接入**：支付、配送执行、退款审核执行、短信/注册/找回密码、提现、打印、外部地图、收银台、真实门店修改。未实现的 API 返回中文“不执行真实业务”，不会统一伪报成功。门店重要信息可查看，外部地图定位不可用。演示层不保证所有高级筛选/排序/规格写入具备真实后端语义。

## 隔离和安全

- Compose 项目 `siam-shop-baseline`，独立网络、只读容器、非 root 运行、仅映射 `127.0.0.1:18081`。
- 不挂载宿主业务目录或数据卷，不读取现有 .env，无 NestJS/Postgres/litemall 连接配置。现有 Docker 构建排除 deploy/siam，pnpm workspace 不包含 vendor。
- fixture 服务要求 `SIAM_BASELINE_FIXTURES=1`，`NODE_ENV=production` 拒绝启动；没有任何应用生产路径导入该服务。
- 浏览器 CSP 只允许同源连接/资源（必要的 data/blob 图片除外），阻止原版残留第三方 API、打印机地址、地图脚本和外部媒体请求。
- 未知接口、金融/订单执行接口明确失败；请求大小限制，上传不保存原始内容，静态路径只允许 public 目录。
- 不修改 PR #18，不合并 PR #20，不继续 litemall UI，不进入 Pricing Engine、AI 或成本整合。

## 验证

`verify.mjs` 校验 90 个原始文件；`fixtures.test.mjs` 验证非空展示数据、演示修改的隔离性、订单筛选与真实操作拒绝、生产/未启用时拒绝启动；`smoke.mjs` 验证 Docker 页面、资源、演示登录、鉴权、主要页面数据及禁止提现。

独立 CI `siam-baseline` 执行来源校验、fixture 测试、Docker 构建和 HTTP 冒烟。原仓库 `checks`、`compose` 保持不变，验证现有工程及迁移/集成测试。具体结果记录在本次 Draft PR。

这份交付仅用于人工确认原版餐饮商家端方向；完成后停下，等待当前会话审查，再决定完整模块迁移。
