-- CreateTable
CREATE TABLE "order_settings" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "autoAccept" BOOLEAN NOT NULL DEFAULT false,
    "terms" JSONB NOT NULL,
    "actor" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mock_delivery_quotes" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "actor" TEXT NOT NULL,
    "priceFen" INTEGER NOT NULL,
    "distanceMeters" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "invalidatedAt" TIMESTAMPTZ(3),

    CONSTRAINT "mock_delivery_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_previews" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "actor" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "publicResult" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "checkout_previews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "actor" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "request" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "orderStatus" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paymentStatus" TEXT NOT NULL DEFAULT 'UNPAID',
    "fulfillmentStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "reservationStatus" TEXT NOT NULL DEFAULT 'HELD',
    "payableFen" INTEGER NOT NULL,
    "testMode" BOOLEAN NOT NULL DEFAULT true,
    "issue" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "finiteStock" BOOLEAN NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "actor" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_settings_storeId_key" ON "order_settings"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "order_settings_merchantId_brandId_storeId_key" ON "order_settings"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE INDEX "mock_delivery_quotes_expiresAt_idx" ON "mock_delivery_quotes"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "mock_delivery_quotes_storeId_id_key" ON "mock_delivery_quotes"("storeId", "id");

-- CreateIndex
CREATE INDEX "checkout_previews_expiresAt_idx" ON "checkout_previews"("expiresAt");

-- CreateIndex
CREATE INDEX "checkout_previews_merchantId_brandId_storeId_actor_idx" ON "checkout_previews"("merchantId", "brandId", "storeId", "actor");

-- CreateIndex
CREATE INDEX "orders_merchantId_brandId_storeId_orderStatus_createdAt_idx" ON "orders"("merchantId", "brandId", "storeId", "orderStatus", "createdAt");

-- CreateIndex
CREATE INDEX "orders_merchantId_brandId_storeId_updatedAt_id_idx" ON "orders"("merchantId", "brandId", "storeId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "orders_orderStatus_expiresAt_idx" ON "orders"("orderStatus", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "orders_storeId_id_key" ON "orders"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_storeId_actor_idempotencyKey_key" ON "orders"("storeId", "actor", "idempotencyKey");

-- CreateIndex
CREATE INDEX "order_items_storeId_variantId_idx" ON "order_items"("storeId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "order_items_orderId_variantId_key" ON "order_items"("orderId", "variantId");

-- CreateIndex
CREATE INDEX "order_events_storeId_orderId_createdAt_id_idx" ON "order_events"("storeId", "orderId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "order_events_orderId_idempotencyKey_key" ON "order_events"("orderId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "order_settings" ADD CONSTRAINT "order_settings_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mock_delivery_quotes" ADD CONSTRAINT "mock_delivery_quotes_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_previews" ADD CONSTRAINT "checkout_previews_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_storeId_orderId_fkey" FOREIGN KEY ("storeId", "orderId") REFERENCES "orders"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_storeId_variantId_fkey" FOREIGN KEY ("storeId", "variantId") REFERENCES "variants"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_storeId_orderId_fkey" FOREIGN KEY ("storeId", "orderId") REFERENCES "orders"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Database boundaries also apply to direct writers and concurrent requests.
ALTER TABLE orders ADD CONSTRAINT orders_values_check CHECK (
  "payableFen" >= 0 AND version > 0 AND "testMode" = true
  AND mode IN ('DELIVERY', 'PICKUP', 'DINE_IN')
  AND "orderStatus" IN ('PENDING_PAYMENT', 'AWAITING_ACCEPTANCE', 'PREPARING', 'READY', 'IN_DELIVERY', 'COMPLETED', 'CANCELLED')
  AND "paymentStatus" IN ('UNPAID', 'PAID', 'FAILED', 'REFUNDED')
  AND "fulfillmentStatus" IN ('NOT_STARTED', 'PREPARING', 'READY', 'DISPATCHING', 'DELIVERING', 'FAILED', 'DELIVERED', 'PICKED_UP', 'CANCELLED')
  AND "reservationStatus" IN ('HELD', 'CONSUMED', 'RELEASED')
);
ALTER TABLE order_items ADD CONSTRAINT order_items_quantity_check CHECK (quantity BETWEEN 1 AND 1000);
ALTER TABLE mock_delivery_quotes ADD CONSTRAINT mock_delivery_quotes_values_check CHECK (
  "priceFen" BETWEEN 0 AND 100000 AND "distanceMeters" BETWEEN 0 AND 100000
  AND "expiresAt" > "createdAt"
);
ALTER TABLE order_settings ADD CONSTRAINT order_settings_revision_check CHECK (revision > 0);
ALTER TABLE variants ADD CONSTRAINT variants_reservation_bounds_check CHECK (
  "reservedQuantity" >= 0 AND ("unlimitedStock" OR "reservedQuantity" <= "stockQuantity")
);
CREATE FUNCTION protect_order_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
     OR NEW.evidence IS DISTINCT FROM OLD.evidence
     OR NEW.request IS DISTINCT FROM OLD.request
     OR NEW.fingerprint IS DISTINCT FROM OLD.fingerprint
     OR NEW."payableFen" IS DISTINCT FROM OLD."payableFen"
     OR NEW."merchantId" IS DISTINCT FROM OLD."merchantId"
     OR NEW."brandId" IS DISTINCT FROM OLD."brandId"
     OR NEW."storeId" IS DISTINCT FROM OLD."storeId"
     OR NEW.actor IS DISTINCT FROM OLD.actor
     OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
     OR NEW."requestHash" IS DISTINCT FROM OLD."requestHash"
     OR NEW.mode IS DISTINCT FROM OLD.mode
     OR NEW."testMode" IS DISTINCT FROM OLD."testMode"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Immutable order snapshot' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER orders_immutable_snapshot BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION protect_order_snapshot();
CREATE FUNCTION protect_order_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Immutable order history' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER order_items_immutable BEFORE UPDATE ON order_items
FOR EACH ROW EXECUTE FUNCTION protect_order_history();
CREATE TRIGGER order_events_immutable BEFORE UPDATE ON order_events
FOR EACH ROW EXECUTE FUNCTION protect_order_history();
