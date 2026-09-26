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

## 商品资料读取

选择门店后，使用 Bearer 与 X-Store-Id 读取 /api/v1/admin/categories、/products。搜索商品名称、描述、分类名称；分类筛选直接使用真实分类。

商品名称、描述、分类、上架状态和规格售价均来自 API。只计未归档且启用、价格合法的规格：单规格显示 ¥18.80，多规格显示最低价加“起”，没有有效规格显示“待设置”。金额沿用整数分格式化，不做浮点元转分。

公开 HTTP(S) 图片直接显示；本店受保护媒体经鉴权读取后显示。失败时显示中文提示，详见下方图片操作。

加载、空列表、失败分别展示；403 显示中文权限提示，401 清除会话并提示重新登录。切换门店不会保留旧商品或让过期响应覆盖新门店。

## 保留范围

- 首页仍保留卡片、趋势、待办结构，没有订单经营数据时显示空状态。
- 已有商品仅开放独立图片保存；新增商品及其他资料保存继续禁用。
- 订单、库存、营销、配送、经营分析、门店设置仍为后续接入占位页。
- 旧后台 /legacy.html 保留，未扩展旧 AdminPanel/Editor/StoreWorkspace。
- 仅新增图片媒体表及上传/读取接口，沿用原权限体系，不进入 Phase 2。

生产静态部署需对 /admin/* 回退到 index.html，保留 legacy.html 独立入口，并按既有方式代理 /api。

源码、MIT 许可证与修改记录见 [OPEN-SOURCE-REUSE.md](OPEN-SOURCE-REUSE.md)。

## 已有商品图片操作（第三步）

已有商品点击“编辑”，图片区域支持 JPG/JPEG/PNG/WebP，最大 5 MiB（界面标为 5 MB）。选择后显示本地预览、真实上传进度；完成后显示服务端规范化图片。点击“保存图片”才更新商品；“移除图片”先暂存空引用，再点击“保存图片”生效。其他商品字段不会随图片保存。

OWNER/MANAGER 可以上传和保存，COST_MANAGER 只可读取授权门店图片。受保护图片携带 Bearer + X-Store-Id 读取 Blob 后显示，换图/卸载释放临时地址，切门店清除旧图片。公开 HTTP(S) 图片仍可直接显示，不附加凭据。

新增 POST /api/v1/admin/media 与 GET /api/v1/admin/media/:id。保存使用原 PATCH /api/v1/admin/products/:id，body 只有 imageUrl（清除为 ""）。上传、下载、绑定均校验 Merchant/Brand/Store。上传失败不修改商品；上传但未保存的资产暂时保留，没有自动清理任务。

新迁移 202609210001_product_media 只增加 media_assets，旧迁移不变。升级开发环境须安装依赖、生成 Prisma 客户端并完成迁移；pnpm dev 一键启动会执行这些步骤。默认本地目录为 ./data/uploads，服务端可用 UPLOAD_DIR 覆盖；Docker 使用 uploads_data 持久卷，升级不需要清除卷。

本步仅开放已有商品图片，其他写操作继续禁用。
