-- The first console migration was already applied. Strengthen historical attribution
-- with a matching immutable completion event in the same transaction, not a reason alone.
UPDATE inventory_movements m SET type = 'ADJUSTMENT', "orderId" = NULL
WHERE m.type = 'ORDER_COMPLETED' AND m.before IS NULL AND m.after IS NULL
AND NOT EXISTS (
  SELECT 1 FROM orders o JOIN order_events e ON e."orderId" = o.id
    AND e."merchantId" = o."merchantId" AND e."brandId" = o."brandId" AND e."storeId" = o."storeId"
  WHERE o.id = m."orderId" AND o."merchantId" = m."merchantId"
    AND o."brandId" = m."brandId" AND o."storeId" = m."storeId"
    AND o."orderStatus" = 'COMPLETED' AND o."reservationStatus" = 'CONSUMED'
    AND e.action IN ('PICKUP', 'DELIVERED') AND e.actor = m.actor AND e."createdAt" = m."createdAt"
);
