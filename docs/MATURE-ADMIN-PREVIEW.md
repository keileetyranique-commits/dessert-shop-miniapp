# Phase 1.1 成熟后台查看说明

## 启动与登录

在仓库根目录运行 `pnpm dev` 启动现有后端、数据库和后台；默认入口 http://localhost:5173/admin/products。
单独运行前端时：

```sh
pnpm install --frozen-lockfile
pnpm --filter @platform/admin-web exec vite --host 127.0.0.1 --port 5175
```

单独前端通过现有 Vite 代理连接 http://127.0.0.1:3000，也可用 API_PROXY_TARGET 环境变量指定后端。打开 http://127.0.0.1:5175/admin/products。

输入管理员提供的“后台访问凭据”（服务端 ADMIN_IDENTITIES 中配置的个人 token）。开发环境凭据由现有启动脚本保存在本机被忽略的 .env，勿提交或分享。凭据仅存本页内存，刷新、退出或 401 后需重新登录。

登录调用 GET /api/v1/admin/session 与 /stores。可用授权门店只有一家时自动选中；多家时在顶部选择；没有时显示“当前没有可用门店”。当前只列出营业中的授权门店，不伪造门店。

## 商品只读范围

选择门店后，使用 Bearer 与 X-Store-Id 读取 /api/v1/admin/categories、/products。搜索商品名称、描述、分类名称；分类筛选直接使用真实分类。

商品名称、描述、分类、上架状态和规格售价均来自 API。只计未归档且启用、价格合法的规格：单规格显示 ¥18.80，多规格显示最低价加“起”，没有有效规格显示“待设置”。金额沿用整数分格式化，不做浮点元转分。

图片为可直接访问的 HTTP(S) 地址时正常显示；加载失败或受保护的 /api/ 媒体显示“暂无图片”。尚未接入 PR #17 的媒体后端，不在图片请求附加凭据。

加载、空列表、失败分别展示；403 显示中文权限提示，401 清除会话并提示重新登录。切换门店不会保留旧商品或让过期响应覆盖新门店。

## 保留范围

- 首页仍保留卡片、趋势、待办结构，没有订单经营数据时显示空状态。
- 商品新增/编辑窗口只预览，保存与图片上传禁用，不发送商品写请求。
- 订单、库存、营销、配送、经营分析、门店设置仍为后续接入占位页。
- 旧后台 /legacy.html 保留，未扩展旧 AdminPanel/Editor/StoreWorkspace。
- 不新增 migration、后端接口或权限体系，不进入 Phase 2。

生产静态部署需对 /admin/* 回退到 index.html，保留 legacy.html 独立入口，并按既有方式代理 /api。

源码、MIT 许可证与修改记录见 [OPEN-SOURCE-REUSE.md](OPEN-SOURCE-REUSE.md)。
