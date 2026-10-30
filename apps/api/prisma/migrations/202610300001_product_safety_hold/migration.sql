ALTER TABLE products ADD COLUMN "safetyHoldReason" TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD CONSTRAINT product_safety_reason_length CHECK (length("safetyHoldReason") <= 500);
