CREATE TABLE "media_assets" (
"id" UUID PRIMARY KEY, "merchantId" UUID NOT NULL, "brandId" UUID NOT NULL, "storeId" UUID NOT NULL,
"createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "storageKey" TEXT NOT NULL, "mimeType" TEXT NOT NULL,
"size" INTEGER NOT NULL CHECK ("size" > 0 AND "size" <= 5242880),
CONSTRAINT "media_assets_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "media_assets_storageKey_key" ON "media_assets"("storageKey");
CREATE INDEX "media_assets_merchantId_brandId_storeId_idx" ON "media_assets"("merchantId", "brandId", "storeId");
