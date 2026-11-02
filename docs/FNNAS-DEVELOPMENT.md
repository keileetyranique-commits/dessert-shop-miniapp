# 飞牛开发验收环境

2026-11-02 部署。飞牛是唯一开发源；Windows Codex 通过 SSH 在飞牛读取、编辑和测试。没有合并 PR，也没有修改 main、PR #26 或 PR #27 分支。

## 位置与访问

- 主机：192.168.10.91；SSH 用户：z4661881。
- 硬件：Intel N5095 四核、约 8 GB 内存。
- 部署目录：`/vol1/1000/codex项目文件/糖水店小程序`。
- 唯一开发源：部署目录下 `workspace/`；`app/` 只是切换前旧快照，不再从它构建。
- Compose：部署目录下 `compose.yaml`；服务端配置：`runtime.env`，不提交 Git。
- 项目：`dessert-shop-fnnas`；数据卷位于飞牛 Docker 数据目录 `/vol2/docker`，由 Docker 管理。
- 局域网后台：<http://192.168.10.91:5173/admin>；POS：<http://192.168.10.91:5174>。
- 数据库与 Redis 不向局域网开放端口。

普通局域网 HTTP 不是浏览器安全上下文，可能限制随机 UUID、PWA 等能力。当前电脑使用仅监听本机的预览代理：

```powershell
node scripts/fnnas-preview.mjs
```

后台：<http://127.0.0.1:15173/admin>；POS：<http://127.0.0.1:15174>。保留该进程运行，退出后服务仍在飞牛运行，但本机入口关闭。代理不新增认证、不记录凭据，不加密电脑到飞牛的局域网 HTTP；仅用于可信局域网开发验收。其他设备完整使用前需配置可信 HTTPS。此代理未实现开发热更新 WebSocket，更新部署后手动刷新。

登录沿用迁移前本地 `.env` 中的后台凭据，不在本文输出。飞牛 SSH 禁止 TCP 转发，因此本机入口使用 HTTP 代理，不是 SSH 隧道。

## 数据与版本

迁移使用 PostgreSQL 一致性备份及上传文件归档，保留本地原件。飞牛与本地是两份独立数据，之后的操作不会互相同步，避免两边同时录入后误以为自动合并。

初次核对：1 个商户、1 个品牌、3 个门店、6 个商品、6 个规格、8 笔订单、8 条订单明细、33 条事件、3 条库存流水、3 个媒体资产；库存合计 197、预占 1。包含已归档记录，因此正常页面可见数量可能较少。三个媒体资产鉴权读取通过。

部署包含 `codex/merchant-inventory-console` 当前未提交开发代码；库存模块尚待完整验收，不是已批准发布版本。恢复数据库保留原有迁移历史（包括此前超时扫描修复已执行的记录），没有删除旧表、字段或历史记录。

## 运行与更新

在飞牛部署目录执行：

```sh
docker compose --env-file runtime.env ps
docker compose --env-file runtime.env logs --tail 100 api
docker compose --env-file runtime.env up -d --no-build --pull never --wait
```

长期服务已配置 `restart: unless-stopped`，迁移任务一次性运行。不要使用 `down -v`，否则会删除持久化数据。

初次在线构建因飞牛镜像源返回 401 失败，改为通过 SSH 传入本地已有镜像。部署目录的 `Dockerfile.offline` 复用已有 Linux 依赖，再复制 `workspace/`、生成 Prisma 客户端并构建；没有修改全局镜像源。后续依赖变化时不能盲目复用旧依赖层，需重新安装冻结锁文件依赖并构建。

后续流程：飞牛 `workspace/` 开发和独立测试库验证 → 明确待部署代码版本 → 备份运行数据库 → 从 `workspace/` 构建 → 执行新增迁移 → 更新容器 → API、后台、POS 验证。不得从 Windows 或旧 `app/` 覆盖 `workspace/`，不得重新恢复初次备份覆盖新数据。

## 已验证与边界

飞牛构建通过、五个长期服务健康、数据库恢复与数量核对通过、媒体读取通过、匿名接口拒绝、已有身份登录成功、真实商品和库存读取通过、重复迁移无待执行项、本机代理访问通过。

这是开发验收部署，不代表库存工作台全套回归、浏览器完整业务验收或 GitHub CI 已完成。没有接入真实支付、配送或 Phase 4。

## 远程开发切换记录

完整 Git 历史已迁入。唯一 Git 工作区是部署目录下 workspace/，原 app/ 仅作旧部署快照。当前分支 codex/merchant-inventory-console，基线 61954e9cb34db7ab3ebebdd39c6e773ec6643172。201 个文件迁入时逐一校验一致，全部原未提交修改已保留；无实质差异的旧迁移和文档仅恢复仓库行尾。未提交、未推送、未合并。

开发容器 dessert-shop-fnnas-dev 将 Git 工作区映射至 /workspace，依赖单独保存于开发卷。运行 docker exec dessert-shop-fnnas-dev pnpm build。重建开发容器使用部署目录 compose.dev.json。集成测试必须另建 test 数据库，不连接经营数据库。

源码保存不自动发布。更新服务时在部署根目录构建 Dockerfile.offline（已改为读取 workspace/），验证后执行 docker compose --env-file runtime.env up -d --no-build --pull never --wait。迁移前备份，不能重复恢复初次数据库备份。

本地目录保留为切换前备份及连接入口，之后不得从本地覆盖飞牛代码。GitHub 凭据未复制到 NAS，后续推送沿用 Codex 现有认证能力，禁止将 Token 写入仓库或日志。

## 本轮冻结依赖安装注意事项

飞牛共享目录继承 ACL 可能使默认工作区 pnpm store 文件权限变为 000，导致 esbuild EACCES。开发容器非交互安装使用 `CI=true pnpm install --frozen-lockfile --store-dir /tmp/inventory-pnpm-store --package-import-method=copy`，保持依赖存储在开发容器中；首次需要完整联网下载，不能假定旧镜像包含冻结锁文件的全部依赖。浏览器验收工具仅安装于容器临时目录，不进入项目依赖。

## 2026-11-03 当前状态更正

上文“未提交、库存尚待验收”是迁移时历史记录，已由 PR #28 交付替代。库存代码已提交并部署，完整回归与浏览器验收见 INVENTORY-CONSOLE.md；当前接管事实见 NAS-PROJECT-HANDOVER.md。GitHub CLI 已由用户在 NAS 完成认证，凭据只在仓库外，不读取或输出认证文件。后续模块仍需各自验收，不能沿用库存的测试结论。
