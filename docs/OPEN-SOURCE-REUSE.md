# C 方案实际复用记录

本轮按 Issue #23 锁定 C 方案，没有再次搜索视觉候选。评估依据为仓库已核验清单；没有从 litemall、siam 或 Open Shop 复制后台页面。Ant Design Pro、antd-admin 仅参考清单中的分层表单/后台信息组织，未复制源码，不引入其完整工程。

## 实际依赖

| 项目 / 仓库                                                        | 版本与许可证        | 使用范围与原始组件                                                                   | 修改与新增依赖                                                    | 选择原因                                                    |
| ------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| [Ant Design](https://github.com/ant-design/ant-design)             | 6.3.3 / MIT         | Form、Modal、Upload.Dragger、Select、Tabs、Alert、Empty、Spin、Progress、Button、Tag | 新增 antd；通过 ConfigProvider 主题和中文文案适配，不修改上游源码 | React 19 兼容，成熟表单/弹窗/上传交互，避免重复实现通用控件 |
| [Ant Design Icons](https://github.com/ant-design/ant-design-icons) | 6.1.0 / MIT         | React 图标组件                                                                       | 新增 @ant-design/icons，不修改源文件                              | 统一导航、动作和状态图标                                    |
| [React Router](https://github.com/remix-run/react-router)          | 7.13.1 / MIT        | BrowserRouter、Routes、NavLink、Navigate                                             | 新增 react-router-dom；配置本项目独立页面路由                     | 保持 React/Vite，成熟导航和历史行为                         |
| [sharp](https://github.com/lovell/sharp)                           | 0.34.5 / Apache-2.0 | 图片解码、旋转、缩放、WebP 编码                                                      | 随 PR #18 后端逻辑移植新增 sharp，无上游源码改动                  | 服务端校验和标准化，避免保存用户原始危险文件                |

许可证依据安装包 LICENSE / LICENSE.md，锁文件固定实际依赖；未删改上游版权声明。依赖增加前端体积，但不增加常驻服务；未使用的图表库不引入，缺少订单数据时显示空状态。

## 项目内选择性移植

来源：本仓库 PR #18，参考提交 `94f158f9a85a4e54114925c6c3b17f0f8a6e555f`。仅迁入：

- API `media.controller.ts`、`image-validation.ts`、`storage.ts`、对应单元/集成测试；MediaAsset schema/migration；AppModule 注册、Docker 图片卷；CatalogController 的媒体归属校验与 products/simple 事务。
- 请求安全解析 `admin-client.ts`；商品 adapter、`product-save.ts` 金额和差异保存逻辑、`media-client.ts` 的鉴权上传逻辑及测试。适配到 `console/`，移除旧页面类型依赖。
- 没有移植 Layout、Products、Dashboard、原生 dialog 或旧 ImageUpload 视觉代码，没有整体 cherry-pick。

## 本项目编写的部分及原因

`console/App.tsx`、Dashboard、Products、Resources、Session、Data、Media 的业务组合及 CSS 遵循用户确认的 C 规范。选择成熟通用组件而非整套后台迁移，是为了保持现有 NestJS/Prisma 租户、安全、整数金额契约，并避免再次引入用户已停止的视觉基座。分类安全归档是现有 API 的小型补充，复用现有软删除字段。确定性金额和权限始终由本项目代码及后端负责。

# Phase 2 追加记录

本期继续使用当前 C 外壳及 Ant Design / Ant Design Icons / React Router（MIT），未引入新 UI 模板或新依赖。定价页与成本补录入口复用其 Form、Select、Collapse、Alert、Table 等既有组件；没有复制新的第三方源码。复用本仓库成本计算、身份与门店验证、安全请求、精确人民币转换。定价和利润保护按 AGENTS.md 的差异化能力要求自研，原因是优惠归属、精确费用舍入、缺失成本阻断、租户规则必须与现有成本中心一致；不使用 AI 计算金额。

# Phase 3 追加记录

- 实际复用 Ant Design 6.3.3（MIT，https://github.com/ant-design/ant-design）：Table、Tabs、Drawer、Timeline、Form、Select、Alert、Switch、Slider 等；不修改第三方源码，通过既有 C 主题和中文文案组合。后台依赖已有；merchant-pos 新增同版本 antd，锁文件同步。
- 参考 Open Shop（MIT，https://github.com/jamezzh7/open-shop-wechat-template），固定 SHA `ffa309206aea6a323493850cdf364ad0565b9fcd` 的 `admin-web/src/pages/Orders.tsx` 状态列表、详情和动作反馈：**仅参考交互/信息架构，未复制源码**。其 CloudBase 后端不适配当前 NestJS/租户/利润规则，因此不迁移。
- 项目内复用 Session、门店选择、请求客户端、订单组件、C 样式、精确人民币转换、Phase 2 定价读取。POS 通过共享现有源文件使用同一订单行为，没有建立第二套权限或后台。
- 提醒使用浏览器 Web Audio，无额外音频依赖；5 秒有限轮询不引入消息基础设施。订单状态、串行化库存、幂等、利润保护和测试授权按仓库要求自研，成熟 UI 组件不承担交易安全规则。
- 增加前端包体积，后台/POS 构建存在超过 500 kB 的提示；未增加新常驻服务、真实支付或第三方配送费用。
