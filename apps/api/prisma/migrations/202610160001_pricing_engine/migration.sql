CREATE TABLE "pricing_rules" (
 "id" UUID PRIMARY KEY, "merchantId" UUID NOT NULL, "brandId" UUID NOT NULL, "storeId" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actor" TEXT NOT NULL, "rules" JSONB NOT NULL,
 CONSTRAINT "pricing_rules_scope_fkey" FOREIGN KEY ("merchantId","brandId","storeId") REFERENCES "stores"("merchant_id","brand_id","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "pricing_rules_merchantId_brandId_storeId_createdAt_id_idx" ON "pricing_rules"("merchantId","brandId","storeId","createdAt" DESC,"id" DESC);
CREATE TABLE "pricing_simulations" (
 "id" UUID PRIMARY KEY, "merchantId" UUID NOT NULL, "brandId" UUID NOT NULL, "storeId" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "actor" TEXT NOT NULL,
 "calculationVersion" TEXT NOT NULL, "inputs" JSONB NOT NULL, "result" JSONB NOT NULL,
 CONSTRAINT "pricing_simulations_scope_fkey" FOREIGN KEY ("merchantId","brandId","storeId") REFERENCES "stores"("merchant_id","brand_id","id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "pricing_simulations_merchantId_brandId_storeId_createdAt_idx" ON "pricing_simulations"("merchantId","brandId","storeId","createdAt" DESC);
