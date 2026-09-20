# 开源复用记录

## Phase 1.1（Issue #16）

遵循 OPEN-SOURCE-REUSE-PRIORITIES.md，先核验清单中的候选与许可证，再选择局部组件。未复制闭源产品代码、图片、商标或素材，也未迁移整个后台工程。

| 项目 / 仓库                                                                               | 许可证                                 | 实际使用与原始范围                                                                                                                                                                                                                 | 修改及依赖                                                                                                                                   | 选择理由                                                                         |
| ----------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Ant Design：[ant-design/ant-design](https://github.com/ant-design/ant-design)             | MIT；核验仓库 LICENSE 及安装包 LICENSE | 实际依赖复用 Upload.Dragger、Table、Modal、Input、Button、Tag、Progress、ConfigProvider/中文语言包；上游 components/upload、table、modal、input、button、tag、progress、config-provider；查看 components/upload/demo/drag.tsx 用法 | admin-web 新增 antd 6.6.4（范围 ^6，锁文件固定）；未复制或修改上游组件源码。本项目包装器接入权限请求头、中文校验、进度、筛选、保存和归档确认 | 与 React 19/Vite 兼容；成熟上传和列表能力可直接复用，无需引入 Umi 或整套管理框架 |
| sharp：[lovell/sharp](https://github.com/lovell/sharp)                                    | Apache-2.0；核验安装包 LICENSE         | 实际依赖复用 lib/input.js、lib/output.js 所提供的解码、元数据、旋转、缩放和 WebP 编码 API                                                                                                                                          | API 新增 sharp 0.34.5；未复制/修改源码，包装在 image-validation.ts。另加 @types/multer、@types/express（MIT，开发类型依赖）                  | 签名检查不能识别损坏或复合文件，成熟解码器避免自行实现图像格式解析               |
| antd-admin：[zuiidea/antd-admin](https://github.com/zuiidea/antd-admin)                   | MIT（核验 LICENSE）                    | **仅参考交互/信息架构，未复制源码**；后台菜单、筛选列表和表单分层                                                                                                                                                                  | 无项目依赖；采用其同类 Ant Design 组件技术路线，保留现有应用入口和 API                                                                       | 清单首选且技术栈适配；整仓迁移对本轮收益不足                                     |
| Ant Design Pro：[ant-design/ant-design-pro](https://github.com/ant-design/ant-design-pro) | MIT（核验 LICENSE）                    | **仅参考交互/信息架构，未复制源码**；基础表单、复杂设置二级入口及空状态                                                                                                                                                            | 不引入 Umi/Pro 工程和额外依赖                                                                                                                | 组件局部复用已足够，避免扩大迁移范围                                             |
| Saleor Dashboard：[saleor/saleor-dashboard](https://github.com/saleor/saleor-dashboard)   | BSD-3-Clause（核验 LICENSE）           | **仅参考交互/信息架构，未复制源码**；商品列表进入编辑、图片与商品资料关联                                                                                                                                                          | 无依赖或复制文件                                                                                                                             | 商品流程成熟，但其完整后台与后端耦合不适合本项目局部重构                         |

第三方实现通过包依赖分发，原始许可证和版权声明保留于包内，不将本项目包装器声称为上游源码。sharp 预编译包包含 libvips 等传递依赖，其中 libvips 为 LGPL-2.1-or-later；使用未修改的动态库，不复制源码进本项目。分发容器时必须保留二进制包内对应许可及告知文件，不剥离这些声明。

### 继续自研的部分及原因

- 金额与百分比转换：本项目要求数据库整数分上限、空值语义及确定性精度，使用短小 BigInt helper；普通金额展示复用统一 helper。
- 租户鉴权、图片归属、软归档和默认规格事务：必须遵守现有 Merchant→Brand→Store 复合约束，第三方后台不能替代领域授权。
- StorageAdapter：仅三个操作，保持云厂商独立；不引入昂贵存储基础设施。
- 保留原有 Editor 原生字段与页面状态管理，增加必填/选填/自动分组：已有成熟表单框架，但本轮无需推翻 Phase 1 的业务编辑器。复杂交互部分已直接采用 Ant Design。
- 本轮没有开发成本算法或 Pricing Engine；保留 Phase 1 确定性成本模型。

AGENTS.md 与 MERCHANT-UX-RULES.md 仅由全仓 Prettier 规范化空行，没有修改任何规则含义。
