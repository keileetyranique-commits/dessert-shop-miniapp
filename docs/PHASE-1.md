# Phase 1：商品、门店与成本中心

从已合并 Phase 0 的 main 开始，分支为 phase-1-product-cost，关联 Issue #2。
业务范围到 SKU 当前成本为止，不包含 Phase 2 的建议售价、优惠、配送利润保护或 PASS/TOPUP/REJECT。

## 启动与登录

Node.js >=22.12、pnpm 10.15.0、Docker Desktop 启动后运行：

```sh
pnpm dev
```

首次启动（或旧 .env 尚无 ADMIN_IDENTITIES 时）生成随机 OWNER 访问凭据和商户/品牌 ID，
仅写入被忽略的本地 .env。迁移后通过独立管理 CLI 建立商户/品牌，不公开初始化 HTTP 接口。
打开 http://localhost:5173，从本机 .env 的 ADMIN_IDENTITIES 取出 token，在登录表单输入。
展开“创建门店”，输入营业资料并保存，即可继续录入业务数据。
已有配置不会被覆盖；如果手动复制 .env.example，必须填写有效的 ADMIN_IDENTITIES。

ADMIN_IDENTITIES 是只在 API 服务端加载的 JSON 数组，每条包括：

- id：操作人员标识。
- token：用安全随机生成器产生的 32 字节密钥，编码为 64 位小写十六进制。
- merchantId、brandId：UUID，必须匹配数据库归属。
- storeIds：明确授权的门店 UUID 数组；只有 OWNER 可配置 "*"，表示该品牌全部门店。
- role：OWNER、COST_MANAGER、MANAGER。

Secret 仅通过环境变量传入，不在源码、构建产物或浏览器持久存储中保存。
本阶段采用个人访问凭据，不提供密码登录、账号管理、SSO 或自助找回。
撤销或轮换凭据须修改服务端环境并重启 API。生产通过 HTTPS 部署，严禁复用开发凭据。
请求头中的角色、商户 ID、开发身份均不作为身份来源；没有开发鉴权旁路。

生产初始化由有数据库访问权限的运维人员显式执行：

```sh
pnpm db:migrate
pnpm --filter @platform/api admin:provision
```

提前通过环境变量配置 DATABASE_URL、REDIS_URL、APP_ENV=production、TEST_MODE=false、
ADMIN_IDENTITIES，以及可选 MERCHANT_NAME、BRAND_NAME。
CLI 幂等创建配置中 OWNER 的商户与品牌，拒绝改变已有品牌归属。
创建门店要求品牌级 OWNER；店级 OWNER 不能自行扩张授权范围。

## 操作流程

1. 创建门店，编辑地址、联系电话、营业时间说明、时区和状态。
2. 创建分类和商品；选择商品，创建 SKU、附加选项组和选项。
3. 库存页维护有限/无限库存、售罄标记，并记录带原因的增减。
4. 食材页配置基础单位和损耗率；逐条新增采购记录，保留历史价格。
5. 选择商品与 SKU，在配方 BOM 页添加食材与数量，保存新版本；可切回旧版本。
6. 包装页创建包装，按 DELIVERY/PICKUP/DINE_IN 保存 SKU 包装清单。
7. 月固定成本页录入七类费用及分摊规则；明确填写可变人工费率，零值表示无此成本。
8. 成本计算页选择月份、履约方式并计算。按订单分摊时需填写每单份数。

商品价格、采购金额、包装成本及固定成本输入单位均为“分”，只接受整数。
结果用元显示，仍通过整数分格式化。没有记录的配置与明确录入的零成本不同。
空 BOM 和空履约包装清单可显式保存，分别表示没有食材或无需 SKU 包装。

## 身份和租户边界

全部 /api/v1/admin 接口要求 Authorization: Bearer 凭据。
门店业务还要求 X-Store-Id：这只是选择器，服务端会验证授权及 Merchant/Brand/Store 归属。
body/query 不能传入任意租户范围；严格校验拒绝额外字段。
MANAGER 能操作商品、SKU、选项和库存；成本接口仅 OWNER/COST_MANAGER 可访问。
后台响应设置 Cache-Control: no-store；未认证不返回业务数据。

每张业务表都包含 merchantId、brandId、storeId，并通过三元外键指向 Store。
商品分类、SKU、配方食材、包装映射等使用 (storeId, parentId) 复合外键防止跨店引用。
数据库另行约束非负库存/金额、损耗范围、正数量，以及每个 SKU 只有一个 active 配方。
库存增减使用有边界条件的原子 UPDATE 和事务流水，保留 reservedQuantity 扩展位；
本阶段没有订单预占或订单扣库存。无限库存标志不允许手工数量变成负数。

## 计算约定

- 基础单位仅 g、ml、each；采购与 BOM 可用 kg/g、L/ml、each。不同维度不能相乘。
- 数量使用十进制字符串，最多 12 位整数和 6 位小数，通过 BigInt 转成微单位。
- 金额输入落库为 PostgreSQL Int（0–2147483647 分），拒绝小数和超范围值。
  中间计算使用 BigInt 有理数，输出必须是 JavaScript 安全整数。
- 损耗使用 0–9999 bps；有效单位成本以采购总分数、标准化数量、损耗的比例计算，
  不把已舍入的单位价格乘回用量。
- 正值四舍五入到分；先按 BOM 每行舍入，再合计并按 recipe.yieldQuantity 分摊。
  可变人工按每批秒数×每分钟费率/60 舍入，加批次其他可变成本后按产出份数分摊。
  SKU 包装按每份配置；最终四个分项相加得到 fullUnitCostFen。
- ITEM：月固定成本/预计月份数。ORDER：月固定成本/预计月订单数/本次每单份数。
  不填写每单份数时返回 PARTIAL，不把每单成本假装成单份成本。
- 当前价格选择 purchasedAt 不晚于计算时刻的最新采购，依次以 createdAt 和 id 打破平局。
  所选月份仅控制固定成本，不代表回算历史采购价格。
- 每次计算在 RepeatableRead 事务中读取一致输入，保存不可修改的 CostSnapshot。
  快照保留完整计算输入、采购/配方来源、版本、月份、结果和 UTC 时间。
  修改采购价或同月固定成本不会改变旧快照；订单成本快照属于后续订单阶段。
- COMPLETE 表示本计算模型所需资料齐全，仍是估算；
  PARTIAL 返回 missingInputs，包括 BOM、采购价、包装、可变人工配置、固定成本或每单份数。
- Recipe 的 yieldQuantity 是批次配方产出；独立 batchCost 支持理论产量、实际产量、报损和
  可售单份成本。实际生产批次追踪、报损流水与混合分摊策略留待后续，不虚构生产记录。
- PackagingItem.scope=ORDER 仅预留整单包装，不能关联到 SKU 配置。

## 已实现 API（统一前缀 /api/v1）

| 路径                                                       | 方法                           | 用途                                                 |
| ---------------------------------------------------------- | ------------------------------ | ---------------------------------------------------- |
| /admin/session                                             | GET                            | 已验证身份（不含 token）                             |
| /admin/stores                                              | GET / POST                     | 授权门店列表 / 品牌 OWNER 创建门店                   |
| /admin/store                                               | GET / PATCH                    | 当前门店资料                                         |
| /admin/categories、/admin/categories/:id                   | GET、POST / PATCH              | 分类                                                 |
| /admin/products、/admin/products/:id                       | GET、POST / GET、PATCH、DELETE | 商品及软删除                                         |
| /admin/products/:id/variants、/admin/variants/:id          | POST / PATCH                   | SKU 创建/修改                                        |
| /admin/variants/:id/stock                                  | POST                           | 原子库存增减和流水                                   |
| /admin/products/:id/modifier-groups                        | POST                           | 创建通用选项组                                       |
| /admin/modifier-groups/:id/modifiers、/admin/modifiers/:id | POST / PATCH                   | 通用选项                                             |
| /admin/costs/ingredients、/admin/costs/ingredients/:id     | GET、POST / PATCH              | 食材；基础单位不可改                                 |
| /admin/costs/purchases                                     | GET / POST                     | 不可覆盖的采购历史                                   |
| /admin/costs/variants/:id/recipes、/recipe                 | GET / PUT                      | 版本历史 / 新配方版本                                |
| /admin/costs/variants/:id/recipes/:recipeId/activate       | POST                           | 切换已存在版本                                       |
| /admin/costs/packaging、/admin/costs/packaging/:id         | GET、POST / PATCH              | 包装项目                                             |
| /admin/costs/variants/:id/packaging                        | GET / PUT                      | 履约包装清单                                         |
| /admin/costs/fixed/:month、/allocation/:month              | GET / PUT                      | 月固定成本 / 分摊规则                                |
| /admin/costs/variants/:id/cost                             | GET                            | month、fulfillment、可选 itemsPerOrder；生成计算快照 |
| /admin/costs/snapshots/:id                                 | GET                            | 读取当前门店历史快照                                 |

严格按 SKU 计算，所以成本、配方与包装 API 使用 variants/:id，避免多个规格歧义。
409 表示库存不足或并发/唯一性冲突；刷新确认后重试。采购与配方写入不做盲目自动重放。

## 测试与验收

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @platform/shared build
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm db:migrate
pnpm db:migrate
pnpm test:integration
```

真实集成测试只允许 APP_ENV=test 且数据库名含 test，使用随机 UUID 隔离数据并只清理自身记录。
CI 的 checks 执行上述全部检查，compose 独立验证一键启动与 smoke。
Phase 1 集成测试通过生产模式 API 验证鉴权，包含跨商户、同商户跨品牌、未授权门店、
真实数据库跨店外键、库存并发、采购历史、配方切换、成本快照和缺失输入。

饮品验收样例：100g 芒果（采购 1000 分/kg，损耗 2000 bps）、100ml 椰浆
（1000 分/L）、10g 糖（500 分/kg），食材共 230 分；包装 30 分；
可变人工与其他 60 分；月固定成本 300000 分/3000 份=100 分；总计 420 分。
再用同一模型录入 1kg 零售商品，验证无需修改核心领域代码。

未包含：密码/SSO 账号管理、图片上传、订单库存预占、真实生产批次管理、整单包装分摊、
自动采购平均价策略、混合固定成本分摊，以及 Phase 2 的定价和利润保护。
