ALTER TABLE "modifiers" ADD COLUMN "costFen" INTEGER;
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_cost_nonnegative" CHECK ("costFen" IS NULL OR "costFen" >= 0);
CREATE INDEX "purchase_latest_idx" ON "purchase_records" ("storeId", "ingredientId", "purchasedAt" DESC, "createdAt" DESC, "id" DESC);
