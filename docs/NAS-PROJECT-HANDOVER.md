# NAS 项目接管报告

2026-11-03 实查。唯一代码路径 `/vol1/1000/codex项目文件/糖水店小程序/workspace`。接管时分支 codex/merchant-inventory-console、HEAD 1a6b07a016506a6795282c213a7be68565b9da88，工作区干净，只有一个 worktree。git fetch 后本地库存分支与 origin 同步；main 远端前进到 c7970c2，未覆盖本地成果。当前新工作分支 codex/merchant-store-settings 从库存 HEAD 创建，保留完整历史。

GitHub 实查 #26（Phase 3）、#27（超时扫描）、#28（库存）均 OPEN/Draft。#28 最新 checks/compose 均成功。#27 没有合入当前代码；运行库保留其已执行迁移历史，不能删除该历史或倒推为代码已合入。历史视觉试验 PR 不作为当前 C 后台基座。

## 实际架构与证据

Monorepo：apps/api（NestJS/Prisma/PostgreSQL/Redis）、admin-web（React/Vite/Ant Design C 后台）、merchant-pos（共享订单/鉴权组件与 PWA）、miniapp（微信骨架）；packages/shared 的整数成本、定价及状态规则，payment/delivery/pricing 契约。package.json、各应用配置、apps/api/src/app.ts 是实际入口。没有运行本地 AI 模型或新增数据基础设施。

Prisma 模型包括 Merchant/Brand/Store、Product/Category/Variant/ModifierGroup/Modifier、MediaAsset/InventoryMovement、Ingredient/PurchaseRecord/Recipe/RecipeItem、PackagingItem/PackagingConfiguration/SkuPackaging、MonthlyFixedCost/CostAllocationRule/CostSnapshot、PricingRule/PricingSimulation、OrderSettings/MockDeliveryQuote/CheckoutPreview/Order/OrderItem/OrderEvent。未发现顾客/地址/会员积分/经营计划/AI/导出模型。准确字段和约束以 schema.prisma 与追加迁移为准。

API 路由通过 controller 装饰器核验：session/stores/store；categories/products/variants/modifiers；media；inventory 与 movements/settings；costs 原料采购配方包装固定成本快照；pricing 规则模拟与历史；orders 预览、创建、列表、详情、动作、重询价和 order-test。均为管理接口，不等于顾客可调用接口。health/runtime 为公开健康运行信息。详见 API.md、PHASE-1/2/3 和 INVENTORY-CONSOLE。

已完成页面：C 导航登录/授权门店选择、商品分类规格选项与图片、库存总览/调整/流水、成本补录和定价模拟；测试订单、测试中心、POS 为真实持久化的 Mock 流程。Dashboard 营业额/趋势/排行、营销、配送、会员等仍占位；settings 此次接管前也是占位。Resources.tsx 显示选项组只新建，不能编辑删除；media.controller 没有删除/回收接口。小程序仅公开 runtime 骨架。不能把模型或菜单当完成。

生产可用的限定能力是受完整租户/角色保护的目录、媒体、库存、成本/定价管理 API；并不代表产品可正式营业。订单/支付/配送为授权测试模式，生产服务端禁止 Mock，真实微信支付和真实承运商都未实现。身份来自服务端 ADMIN_IDENTITIES，不是员工账号管理，顾客不得持有这些凭据。

## 运行与数据核验

Compose 位于项目父目录，runtime.env 只作为服务端配置，不输出内容。五个项目服务 api/admin/pos/postgres/redis 当前 healthy；开发容器 dessert-shop-fnnas-dev 绑定 workspace。另有其他项目容器，本次不操作。API/Admin/POS 绑定局域网 192.168.10.91 的 3000/5173/5174；数据库与 Redis 没有宿主公开端口。运行卷独立，旧 app 是快照。

本会话前一轮已实际备份运行数据库、执行追加迁移和更新镜像，鉴权读取真实门店库存及流水与 API/Admin/POS smoke 通过；未写入经营测试订单。库存专项浏览器夹具只进入 inventory_console_review_test。接管不读取 Secret、不重新导入旧备份、不调整存储池/权限/其他项目。运行库迁移状态与表计数仍应在每次部署时只读核对，不能凭静态文档替代。

已有测试：shared 成本/定价/状态机；API 配置、权限、媒体、生产开关；真实数据库租户/成本/定价/订单/库存；后台表单与错误、POS 音频/断线；小程序构建。最近库存交付实际 125 项单元/前端、24 项数据库集成全通过，连续两次迁移通过；证据见 INVENTORY-CONSOLE 与 PR #28 CI。新模块必须独立验收，不能沿用这些数量冒充新验证。

## 缺项与下一阶段

完整愿景与逐项证据在 PRODUCT-REQUIREMENTS-MAP.md，继续维护，避免复制一份互相漂移的进度表。当前先补门店资料界面（复用已有受权限保护 API），然后选项组维护、孤立媒体安全回收、员工账号与设备权限、POS 循环确认提醒、成本历史界面。真实统计必须先明确测试单排除及真实数据来源。阶段顺序与独立验收见 DEVELOPMENT-ROADMAP.md。没有批准合并历史 PR，也没有把长期愿景解释为可直接支出费用或接入真实交易。

本轮只读 SQL/Prisma 核对运行库：1 商户、1 品牌、3 门店、6 商品、6 规格、8 订单，实际库存合计197、预占1。已执行迁移包含 202610310001_fair_order_timeout、两笔 inventory 迁移；未修改其记录。此核对只说明当前数量和迁移存在，不证明全部历史业务资料完整。

本轮选择门店基本资料界面，不改变订单/库存/成本规则、不新增 API 或 migration。继续复用 Ant Design（MIT）Form/Collapse/Input/Alert 和已受生产租户权限保护的 GET/PATCH /admin/store。读取失败可重试，失败保留输入；只 PATCH 四个允许字段，不把时区/启停/租户等自动字段发回。状态暂只读，自动营业时段仍未实现。下次继续此基础模块之外的缺项前，应独立评审验收范围。
