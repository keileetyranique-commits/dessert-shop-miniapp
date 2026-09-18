# Phase 0 工程初始化

## 范围与决定

Phase 0 已通过 PR #11 合并到 main；Issue #1 已关闭。
保留原 Monorepo 目录，内部包使用通用 `@platform/*` 名称。
Phase 0 不实现商品 CRUD、真实订单、支付、配送、权限或智能研判。

- 原数据库仅有 Store，不能保证跨品牌/商户关系一致，因此先建立 Merchant → Brand → Store。
  Store 使用 (merchant_id, brand_id) 复合外键；保留 schema_version、custom_fields、feature_flags。
  未来业务查询必须由已验证身份构造租户范围，不得信任客户端提交的商户 ID。
- ARCHITECTURE 第 6、8 节对生产 Mock 存在矛盾。本阶段以“生产禁止 Mock”为准：
  APP_ENV=production 或 NODE_ENV=production 时，TEST_MODE=true 直接启动失败。
  当前不注册任何 Mock 接口；Phase 3 必须继续落实服务端开关与鉴权。
- 金额为带 Fen 类型标记的安全整数，拒绝小数和溢出。当前只有租户基础表；
  后续金额列使用整数分，贡献利润允许负值，百分率使用整数基点。
  COSTING-PRICING 的小数 JSON 示例仅为展示示例，不作为 API 金额契约。
- 支付、配送和定价包只有接口约定，未伪装成已经实现的业务。
- Prisma 固定为 6.19.0，使 schema、CLI 和生成客户端版本一致；升级主版本应独立评审。

## 一键启动

前置：Node.js >=22.12、pnpm 10.15.0、Docker Desktop（Linux containers / Compose v2），启动 Docker 引擎。
在仓库根目录：

```sh
pnpm dev
```

无需先在宿主机安装依赖。首次命令生成被 Git 忽略的 .env 和随机本地密码，
构建开发镜像，启动 PostgreSQL、Redis，执行 prisma migrate deploy，再启动 API/Admin/POS，
等待健康检查通过。已有 .env 不会覆盖；从旧版本升级时按 .env.example 更新配置，
DATABASE_URL/REDIS_URL 的容器主机名分别是 postgres/redis。

- API: http://localhost:3000/api/v1/health/ready
- Admin: http://localhost:5173
- POS: http://localhost:5174
- 停止：`docker compose down`，数据卷保留。
- 日志：`docker compose logs -f api`。
- API/Admin/POS 的 src 已挂载，修改后自动重载。修改依赖、共享包或 schema 后重新执行 `pnpm dev`。
- PostgreSQL/Redis 不向宿主机公开端口；浏览器端口仅绑定本机。
- 这是开发 Compose，不是生产部署方案；正式部署须独立数据库、Redis、凭据与数据卷。
  不要给开发 Compose 填入正式支付/配送密钥。

PWA 的 service worker 只在生产构建中启用；开发服务器保持热更新。
验证安装与离线页面时运行 `pnpm --filter @platform/merchant-pos build`，
再运行 `pnpm --filter @platform/merchant-pos exec vite preview --port 4174`。
生产托管需要把 /api 代理至 API。缓存仅包含应用资源，API 使用 NetworkOnly；
离线时不能接单，不做交易请求离线重放。

## 宿主机开发与检查

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm --filter @platform/shared build
pnpm check
```

若 API 跑在宿主机，为 DATABASE_URL、REDIS_URL 配置可访问的独立开发服务，
通过进程环境或 ENV_FILE 传入，然后 `pnpm dev:apps`。
根 .env 默认用于 Compose，其 postgres/redis 主机名不适用于宿主机。

真实集成测试须先启动独立 PostgreSQL 与 Redis，通过环境变量设置：
APP_ENV=test、TEST_MODE=true、DATABASE_URL（库名含 test）、REDIS_URL（独立测试实例）。
然后：

```sh
pnpm db:migrate
pnpm db:migrate
pnpm test:integration
```

测试校验迁移可重复执行、跨商户品牌引用被拒绝、租户查询、Redis 读写和 API 就绪。
只清理自己创建的 UUID 测试记录，不清空现有表。

## 微信开发者工具

```sh
pnpm --filter @platform/miniapp build
```

导入 apps/miniapp/dist。默认 touristappid 供开发者工具体验；使用真实 AppID 时通过
WECHAT_APP_ID 环境变量传入，API 地址通过 MINIAPP_API_BASE_URL 传入。
生产构建设置 APP_ENV=production，要求 AppID 和 HTTPS。
真机需可访问的 HTTPS 地址并配置微信 request 合法域名。
本地 localhost 调试可在开发者工具中临时关闭合法域名检查；发布前必须恢复检查。
AppSecret、支付密钥和配送密钥永远不进入小程序构建。

## CI 与验收

CI 使用固定 pnpm、冻结锁文件，依次执行 lint、格式、类型、单元/组件测试、构建、
重复迁移和真实 PostgreSQL/Redis 集成测试。
独立 Compose job 从空环境运行一键启动，再验证 API、Admin、POS 及代理。

Phase 0 CI checks / compose / PostgreSQL / Redis / migration / integration / smoke 已全部通过。
原有 CI billing 阻塞已解除。
微信开发者工具与真机人工验收另行执行。

## 后续阶段

Phase 0 已完成评审与 CI 验收，Phase 1 从最新 main 开始。
Phase 1 实现门店、通用 Product/Variant/Modifier、库存与成本中心，
从第一条业务 API 开始建立身份认证和租户授权；不得把没有鉴权的 CRUD 当成可正式营业能力。
