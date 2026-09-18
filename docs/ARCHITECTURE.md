# 系统架构设计（v0.1）

## 1. 总体架构

采用单仓库 Monorepo，前后端分离：

```text
apps/
  miniapp/        微信顾客端
  admin-web/      商家后台
  merchant-pos/   接单工作台/PWA
  api/            后端 API
packages/
  pricing/        成本、利润、定价与订单预判
  delivery/       配送适配器
  payment/        支付适配器
  shared/         公共类型、校验、工具
  config/         配置
```

建议技术栈：

- 小程序：原生微信小程序 + TypeScript
- 管理后台 / POS：React + TypeScript
- 后端：Node.js + TypeScript + NestJS
- 数据库：PostgreSQL
- ORM：Prisma
- 缓存 / 队列：Redis（订单事件、异步回调、重试）
- 实时通信：WebSocket / SSE
- 文件存储：对象存储（商品图、铃声）
- 日志：结构化日志 + audit_logs
- 部署：Docker

## 2. 核心领域

- Catalog：商品、SKU、加料、库存
- Pricing：成本、利润、建议定价、订单预判
- Order：购物车、订单、状态机
- Payment：微信支付 / Mock
- Delivery：顺丰 / 达达 / Mock / 预留美团
- Member：会员、积分、优惠券
- Store：门店、营业时间、配送范围
- POS：接单、响铃、自动接单
- Test Center：全流程模拟和故障注入
- Reporting：经营数据、成本、利润

## 3. 订单状态机

```text
DRAFT
→ QUOTING
→ PRICING_CHECK
→ WAITING_PAYMENT
→ PAID
→ ACCEPTED
→ PREPARING
→ READY_FOR_DELIVERY
→ DELIVERY_REQUESTED
→ RIDER_ACCEPTED
→ PICKED_UP
→ DELIVERING
→ COMPLETED
```

异常分支：

- CANCELLED
- REFUNDING
- REFUNDED
- DELIVERY_FAILED
- MANUAL_REVIEW

所有状态迁移必须由服务端验证，不允许前端任意改状态。

## 4. 实时订单

- 顾客支付成功后创建订单事件。
- POS 通过 WebSocket/SSE 接收。
- 新订单触发自定义铃声。
- 未接单可按后台规则循环提醒。
- POS 断线重连后补拉未处理订单，避免漏单。

## 5. 配送架构

统一接口：

```ts
interface DeliveryProvider {
  quote(input): Promise<DeliveryQuote>
  createDelivery(input): Promise<DeliveryOrder>
  cancelDelivery(input): Promise<void>
  queryDelivery(id): Promise<DeliveryStatus>
  verifyCallback(payload, headers): boolean
}
```

第一阶段：

- sf
- dada
- mock

预留：

- meituan

业务层只调用统一 DeliveryService，不直接调用某一平台。

## 6. 支付架构

```ts
interface PaymentProvider {
  createPayment(input)
  queryPayment(id)
  refund(input)
  verifyCallback(payload, headers)
}
```

第一阶段：

- wechat
- mock

生产环境禁止使用 mock。

## 7. Pricing Engine

结算时统一走：

1. 商品价格快照
2. 商品成本快照
3. 优惠计算
4. 地址距离
5. 多配送平台询价
6. 配送比价
7. 顾客/商家配送费分摊
8. 支付手续费估算
9. 贡献利润
10. 全成本利润估算
11. PASS / TOPUP / REJECT

支付前再次执行最终校验。

## 8. 测试模式

- 开发 / 测试环境默认可用。
- 生产环境由服务端配置决定是否允许。
- 关闭后：
  - Mock Payment 禁用
  - Mock Delivery 禁用
  - Test Scenario API 禁用
  - 测试订单入口不可用
- 不能仅靠前端隐藏。

## 9. 权限

角色：

- OWNER：全部权限
- MANAGER：订单、商品、活动、报表
- CASHIER：订单和接单
- KITCHEN：制作状态
- ANALYST：只读报表

成本、利润、密钥、最低利润线只允许 OWNER 或指定高级权限查看/修改。

## 10. 必须补充的经营保护

- 库存不足时禁止支付。
- 营业时间外禁止新配送订单。
- 配送平台无可用骑手时不盲目收款。
- 退款与取消必须可追溯。
- 每个订单保存价格、成本、优惠、配送报价快照。
- 数据库每日备份。
- 关键配置修改写入审计日志。
- 正式密钥不可提交 GitHub。
- 用户隐私信息最小化采集。


## 11. 可扩展平台架构

新增领域：
- Growth：转化、加购、复购、优惠策略和 A/B 实验
- Experiment：实验分流、指标、结果
- Insight Plan：研判计划、审批、暂停、重新研判
- Tenant：商户/品牌/门店隔离
- Feature Flag：模块开关和渐进发布
- Custom Fields：行业自定义属性

建议新增 packages：
```text
packages/
  growth/         # 优惠策略、增长规则、实验
  insights/       # 智能研判与计划
  experiments/    # A/B 测试
  tenant/         # 商户/品牌/门店上下文
  feature-flags/  # 功能开关
```

核心代码只依赖通用 Product / Variant / Modifier / Fulfillment 等模型；糖水店特有配置通过行业模板实现。

详细见：
- docs/GROWTH-BEHAVIOR.md
- docs/PLATFORM-GENERALIZATION.md
