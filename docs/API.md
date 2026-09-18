# 后端 API 设计（v0.1）

统一前缀：`/api/v1`

Phase 0 已实现：GET /health/live、GET /health/ready、GET /runtime。
就绪检查同时验证 PostgreSQL 和 Redis；runtime 仅返回公开环境信息，不返回凭据。
Phase 1 商品、门店与成本 API 的实际路径、鉴权及字段约定见 [PHASE-1.md](PHASE-1.md)。
下文其余订单、支付、配送等业务 API 仍为后续设计；不会暴露 Mock 支付或订单写入接口。

## 1. 顾客端

### 门店与商品
- GET /stores/:id
- GET /stores/:id/menu
- GET /products/:id

### 地址与配送预判
- POST /checkout/preview
  - 输入：门店、购物车、地址、优惠券
  - 输出：距离、配送报价、预计利润判定、需补配送费

- POST /checkout/requote
  - 用户决定补配送费后重新询价并重算

### 订单
- POST /orders
- GET /orders/:id
- GET /orders
- POST /orders/:id/cancel

### 支付
- POST /orders/:id/payments/wechat
- POST /payments/wechat/callback

### 会员
- GET /me/member
- GET /me/coupons
- GET /me/points

## 2. 商家后台

### 商品
- GET /admin/products
- POST /admin/products
- PATCH /admin/products/:id
- POST /admin/products/:id/stock

### 成本
- GET /admin/costs/ingredients
- POST /admin/costs/ingredients
- POST /admin/costs/purchases
- GET /admin/products/:id/cost
- PUT /admin/products/:id/recipe
- PUT /admin/products/:id/packaging
- PUT /admin/costs/fixed/:month

### 智能定价
- POST /admin/pricing/simulate
- GET /admin/products/:id/pricing-recommendation
- PUT /admin/pricing/rules

### 订单
- GET /admin/orders
- GET /admin/orders/:id
- POST /admin/orders/:id/accept
- POST /admin/orders/:id/reject
- POST /admin/orders/:id/preparing
- POST /admin/orders/:id/ready
- POST /admin/orders/:id/refund

### 配送
- POST /admin/orders/:id/delivery/quote
- POST /admin/orders/:id/delivery/dispatch
- POST /admin/deliveries/:id/cancel

### 会员与优惠
- GET /admin/members
- GET /admin/members/:id
- POST /admin/coupons
- PATCH /admin/coupons/:id

### 设置
- GET /admin/settings
- PUT /admin/settings/delivery
- PUT /admin/settings/profit-guard
- PUT /admin/settings/notifications
- PUT /admin/settings/auto-accept

## 3. POS

- GET /pos/orders/pending
- POST /pos/orders/:id/accept
- POST /pos/orders/:id/reject
- POST /pos/orders/:id/preparing
- POST /pos/orders/:id/ready
- GET /pos/events/stream

## 4. 配送回调

- POST /webhooks/delivery/sf
- POST /webhooks/delivery/dada
- POST /webhooks/delivery/meituan

要求：
- 验签
- provider_event_id 去重
- 幂等
- 原始 payload 留存

## 5. 测试中心

仅在服务端明确启用测试模式时可用：

- POST /admin/test/run
- POST /admin/test/orders
- POST /admin/test/payments/:id/succeed
- POST /admin/test/deliveries/:id/advance
- POST /admin/test/failures

正式模式必须返回 404/403，不允许执行。

## 6. checkout/preview 输出建议

```json
{
  "decision": "NEED_DELIVERY_TOPUP",
  "distanceMeters": 5210,
  "deliveryQuotes": [
    {"provider":"sf","priceFen":980,"etaMinutes":32},
    {"provider":"dada","priceFen":760,"etaMinutes":38}
  ],
  "selectedQuote": {"provider":"dada","priceFen":760},
  "subtotalFen": 3800,
  "discountFen": 500,
  "customerDeliveryFeeFen": 200,
  "storeDeliverySubsidyFen": 560,
  "contributionProfitFen": 120,
  "requiredTopupFen": 380,
  "quoteExpiresAt": "..."
}
```

## 7. 幂等要求

以下接口必须带 idempotency key：

- 创建支付
- 支付回调
- 创建退款
- 配送发单
- 配送取消
- 配送回调

Phase 1 审查修复：成本 GET 仅预览，显式 POST `/admin/costs/variants/:id/cost/snapshots` 保存快照；新增受成本权限保护的 Modifier 成本接口和 `DELETE /admin/variants/:id` 归档。完整权限及参数见 [Phase 1](PHASE-1.md)。
