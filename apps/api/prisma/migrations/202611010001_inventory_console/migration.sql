ALTER TABLE variants ADD COLUMN "lowStockThreshold" INTEGER,
  ADD COLUMN "soldOutReason" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "inventoryUpdatedAt" TIMESTAMPTZ(3),
  ADD CONSTRAINT inventory_threshold_valid CHECK ("lowStockThreshold" IS NULL OR "lowStockThreshold" >= 0);
-- Unknown historic update times remain NULL; do not invent a modification date.
CREATE FUNCTION inventory_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW."stockQuantity", NEW."reservedQuantity", NEW."unlimitedStock", NEW."soldOut", NEW."lowStockThreshold", NEW."soldOutReason", NEW.status, NEW."deletedAt")
    IS DISTINCT FROM ROW(OLD."stockQuantity", OLD."reservedQuantity", OLD."unlimitedStock", OLD."soldOut", OLD."lowStockThreshold", OLD."soldOutReason", OLD.status, OLD."deletedAt") THEN
    NEW."inventoryUpdatedAt" = clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER variants_inventory_touch BEFORE UPDATE ON variants FOR EACH ROW EXECUTE FUNCTION inventory_touch();
ALTER TABLE inventory_movements ADD COLUMN type TEXT NOT NULL DEFAULT 'ADJUSTMENT',
  ADD COLUMN "idempotencyKey" TEXT, ADD COLUMN "requestHash" TEXT,
  ADD COLUMN before JSONB, ADD COLUMN after JSONB, ADD COLUMN "orderId" UUID;
-- Classify only verified legacy completion records, never arbitrary merchant reasons.
UPDATE inventory_movements m SET type = 'ORDER_COMPLETED', "orderId" = o.id
FROM orders o WHERE m."storeId" = o."storeId" AND m."merchantId" = o."merchantId"
  AND m."brandId" = o."brandId" AND m.reason = '测试订单完成：' || o.id::text
  AND EXISTS (SELECT 1 FROM order_items i WHERE i."orderId" = o.id AND i."variantId" = m."variantId" AND i.quantity = -m.delta);
ALTER TABLE inventory_movements ADD CONSTRAINT inventory_movement_order_fk
  FOREIGN KEY ("storeId", "orderId") REFERENCES orders ("storeId", id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "inventory_movements_storeId_variantId_actor_idempotencyKey_key" ON inventory_movements ("storeId", "variantId", actor, "idempotencyKey");
CREATE INDEX "inventory_movements_merchantId_brandId_storeId_createdAt_id_idx" ON inventory_movements ("merchantId", "brandId", "storeId", "createdAt", id);
