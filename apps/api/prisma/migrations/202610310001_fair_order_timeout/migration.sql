-- Scheduling metadata is separate from the immutable sale and the business expiry.
ALTER TABLE orders ADD COLUMN "timeoutCheckAfter" TIMESTAMPTZ(3) NOT NULL DEFAULT '1970-01-01 00:00:00+00';
CREATE INDEX orders_timeout_queue_idx ON orders ("timeoutCheckAfter", "expiresAt", id)
WHERE "orderStatus" IN ('PENDING_PAYMENT', 'AWAITING_ACCEPTANCE');
