# 数据库设计（v0.1）

Phase 0 实际迁移仅包含 merchants、brands、stores。
品牌归属商户；门店使用 (merchant_id, brand_id) 复合外键约束，防止跨商户品牌引用。
门店预留 schema_version、feature_flags、custom_fields 和 deleted_at。
Phase 1 在新迁移中加入通用商品、SKU、选项、库存流水、食材采购、配方、包装、月固定成本和成本快照。
实际模型与租户约束见 Prisma schema 及 [PHASE-1.md](PHASE-1.md)；下文其余订单、支付等表仍为后续设计。
所有业务查询需基于已认证租户范围执行。

## 1. 核心原则

- PostgreSQL
- 所有金额统一使用“分”为整数存储，禁止浮点数。
- 所有历史订单保存快照，不能依赖当前商品价格反推。
- 软删除用于商品、门店等需要追溯的业务数据。
- 时间统一存 UTC，前端按门店时区展示。

## 2. 门店与权限

### stores
- id
- name
- address
- latitude
- longitude
- status
- timezone
- created_at
- updated_at

### store_settings
- store_id
- free_delivery_radius_m
- soft_delivery_radius_m
- hard_delivery_radius_m
- max_store_delivery_subsidy_fen
- minimum_order_fen
- minimum_contribution_profit_fen
- minimum_contribution_margin_bps
- target_full_cost_margin_bps
- allow_delivery_topup
- auto_accept_enabled
- delivery_strategy
- quote_ttl_seconds

### staff_users
- id
- store_id
- name
- phone
- role
- status

## 3. 商品与库存

### products
- id
- store_id
- category_id
- name
- description
- image_url
- status

### product_skus
- id
- product_id
- name
- sale_price_fen
- stock_quantity
- is_unlimited_stock
- status

### addons
- id
- store_id
- name
- sale_price_fen
- cost_fen

## 4. 食材与成本

### ingredients
- id
- store_id
- name
- unit
- loss_rate_bps

### ingredient_purchase_prices
- id
- ingredient_id
- supplier_name
- quantity
- total_cost_fen
- unit_cost_fen
- purchased_at

### recipes
- id
- product_sku_id
- version
- active

### recipe_items
- id
- recipe_id
- ingredient_id
- quantity

### packaging_items
- id
- store_id
- name
- unit_cost_fen

### product_packaging
- id
- product_sku_id
- packaging_item_id
- quantity

### monthly_fixed_costs
- id
- store_id
- month
- rent_fen
- utilities_fen
- payroll_fen
- property_fee_fen
- depreciation_fen
- software_fen
- other_fen

### cost_allocation_rules
- id
- store_id
- allocation_type
- expected_monthly_orders
- expected_monthly_items
- variable_labor_cost_per_minute_fen

## 5. 用户、会员、地址

### users
- id
- wechat_openid
- unionid
- nickname
- phone_encrypted
- created_at

### members
- id
- user_id
- store_id
- points
- first_order_at
- last_order_at
- order_count
- total_paid_fen

### addresses
- id
- user_id
- contact_name
- contact_phone_encrypted
- province
- city
- district
- detail
- latitude
- longitude

## 6. 优惠

### coupons
- id
- store_id
- type
- name
- discount_fen
- discount_bps
- min_spend_fen
- valid_from
- valid_to
- stack_policy
- status

### user_coupons
- id
- user_id
- coupon_id
- status
- used_order_id

### points_ledger
- id
- member_id
- order_id
- points_delta
- reason
- created_at

## 7. 订单

### orders
- id
- order_no
- store_id
- user_id
- fulfillment_type
- status
- subtotal_fen
- discount_fen
- customer_delivery_fee_fen
- store_delivery_subsidy_fen
- payable_fen
- contribution_profit_fen
- contribution_margin_bps
- full_cost_profit_estimate_fen
- selected_delivery_provider
- pricing_decision
- address_snapshot_json
- created_at
- paid_at
- completed_at

### order_items
- id
- order_id
- product_id
- product_sku_id
- name_snapshot
- quantity
- unit_price_fen
- unit_cost_fen
- packaging_cost_fen
- addon_snapshot_json

### order_price_snapshots
- id
- order_id
- goods_revenue_fen
- coupon_cost_fen
- payment_fee_fen
- delivery_cost_fen
- customer_delivery_fee_fen
- ingredient_cost_fen
- packaging_cost_fen
- variable_labor_cost_fen
- allocated_fixed_cost_fen
- contribution_profit_fen
- full_cost_profit_fen
- calculation_version
- created_at

## 8. 配送

### delivery_quotes
- id
- order_id
- provider
- quote_id
- distance_m
- price_fen
- eta_minutes
- expires_at
- raw_response_json

### deliveries
- id
- order_id
- provider
- provider_order_id
- quoted_price_fen
- actual_price_fen
- status
- rider_name_masked
- rider_phone_masked
- created_at

### delivery_events
- id
- delivery_id
- event_type
- provider_event_id
- payload_json
- occurred_at

## 9. 支付与退款

### payments
- id
- order_id
- provider
- provider_payment_id
- amount_fen
- status
- idempotency_key
- paid_at

### refunds
- id
- order_id
- payment_id
- amount_fen
- reason
- status
- provider_refund_id
- idempotency_key

## 10. 接单与通知

### notification_settings
- id
- store_id
- new_order_sound_url
- cancel_sound_url
- rider_arrived_sound_url
- exception_sound_url
- volume
- repeat_interval_seconds
- repeat_until_accepted

## 11. 测试

### test_scenarios
- id
- name
- enabled
- scenario_type
- config_json

### test_runs
- id
- scenario_id
- order_id
- status
- started_at
- finished_at

## 12. 审计与幂等

### audit_logs
- id
- store_id
- staff_user_id
- action
- entity_type
- entity_id
- before_json
- after_json
- created_at

### idempotency_keys
- key
- scope
- response_json
- expires_at
