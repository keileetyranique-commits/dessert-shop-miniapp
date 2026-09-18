-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "address" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "businessHours" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "contactPhone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "categoryId" UUID NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variants" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "salePriceFen" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "stockQuantity" INTEGER NOT NULL DEFAULT 0,
    "unlimitedStock" BOOLEAN NOT NULL DEFAULT false,
    "soldOut" BOOLEAN NOT NULL DEFAULT false,
    "reservedQuantity" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_groups" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "minSelections" INTEGER NOT NULL DEFAULT 0,
    "maxSelections" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifiers" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "groupId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "salePriceFen" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "variantId" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actor" TEXT NOT NULL,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "baseUnit" TEXT NOT NULL,
    "lossRateBps" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_records" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ingredientId" UUID NOT NULL,
    "supplier" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "totalCostFen" INTEGER NOT NULL,
    "purchasedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "purchase_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "variantId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "yieldQuantity" INTEGER NOT NULL DEFAULT 1,
    "laborSeconds" INTEGER NOT NULL DEFAULT 0,
    "otherVariableCostFen" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_items" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipeId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "quantity" TEXT NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "recipe_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_items" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "unitCostFen" INTEGER NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'SKU',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "packaging_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_configurations" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "variantId" UUID NOT NULL,
    "fulfillment" TEXT NOT NULL,

    CONSTRAINT "packaging_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sku_packaging" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "configurationId" UUID NOT NULL,
    "packagingItemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "sku_packaging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_fixed_costs" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "month" TEXT NOT NULL,
    "rentFen" INTEGER NOT NULL,
    "utilitiesFen" INTEGER NOT NULL,
    "payrollFen" INTEGER NOT NULL,
    "propertyFeeFen" INTEGER NOT NULL,
    "depreciationFen" INTEGER NOT NULL,
    "softwareFen" INTEGER NOT NULL,
    "otherFen" INTEGER NOT NULL,

    CONSTRAINT "monthly_fixed_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_allocation_rules" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "month" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "expectedMonthlyOrders" INTEGER NOT NULL,
    "expectedMonthlyItems" INTEGER NOT NULL,
    "laborFenPerMinute" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "futureRules" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "cost_allocation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_snapshots" (
    "id" UUID NOT NULL,
    "merchantId" UUID NOT NULL,
    "brandId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "variantId" UUID NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "cost_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categories_merchantId_brandId_storeId_idx" ON "categories"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_storeId_id_key" ON "categories"("storeId", "id");

-- CreateIndex
CREATE INDEX "products_merchantId_brandId_storeId_idx" ON "products"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "products_storeId_id_key" ON "products"("storeId", "id");

-- CreateIndex
CREATE INDEX "variants_merchantId_brandId_storeId_idx" ON "variants"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "variants_storeId_id_key" ON "variants"("storeId", "id");

-- CreateIndex
CREATE INDEX "modifier_groups_merchantId_brandId_storeId_idx" ON "modifier_groups"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "modifier_groups_storeId_id_key" ON "modifier_groups"("storeId", "id");

-- CreateIndex
CREATE INDEX "modifiers_merchantId_brandId_storeId_idx" ON "modifiers"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "modifiers_storeId_id_key" ON "modifiers"("storeId", "id");

-- CreateIndex
CREATE INDEX "inventory_movements_merchantId_brandId_storeId_idx" ON "inventory_movements"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_movements_storeId_id_key" ON "inventory_movements"("storeId", "id");

-- CreateIndex
CREATE INDEX "ingredients_merchantId_brandId_storeId_idx" ON "ingredients"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_storeId_id_key" ON "ingredients"("storeId", "id");

-- CreateIndex
CREATE INDEX "purchase_records_merchantId_brandId_storeId_idx" ON "purchase_records"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_records_storeId_id_key" ON "purchase_records"("storeId", "id");

-- CreateIndex
CREATE INDEX "recipes_merchantId_brandId_storeId_idx" ON "recipes"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_storeId_id_key" ON "recipes"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_storeId_variantId_version_key" ON "recipes"("storeId", "variantId", "version");

-- CreateIndex
CREATE INDEX "recipe_items_merchantId_brandId_storeId_idx" ON "recipe_items"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_items_storeId_id_key" ON "recipe_items"("storeId", "id");

-- CreateIndex
CREATE INDEX "packaging_items_merchantId_brandId_storeId_idx" ON "packaging_items"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_items_storeId_id_key" ON "packaging_items"("storeId", "id");

-- CreateIndex
CREATE INDEX "packaging_configurations_merchantId_brandId_storeId_idx" ON "packaging_configurations"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_configurations_storeId_id_key" ON "packaging_configurations"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_configurations_storeId_variantId_fulfillment_key" ON "packaging_configurations"("storeId", "variantId", "fulfillment");

-- CreateIndex
CREATE INDEX "sku_packaging_merchantId_brandId_storeId_idx" ON "sku_packaging"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "sku_packaging_storeId_id_key" ON "sku_packaging"("storeId", "id");

-- CreateIndex
CREATE INDEX "monthly_fixed_costs_merchantId_brandId_storeId_idx" ON "monthly_fixed_costs"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_fixed_costs_storeId_id_key" ON "monthly_fixed_costs"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_fixed_costs_storeId_month_key" ON "monthly_fixed_costs"("storeId", "month");

-- CreateIndex
CREATE INDEX "cost_allocation_rules_merchantId_brandId_storeId_idx" ON "cost_allocation_rules"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "cost_allocation_rules_storeId_id_key" ON "cost_allocation_rules"("storeId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_allocation_rules_storeId_month_key" ON "cost_allocation_rules"("storeId", "month");

-- CreateIndex
CREATE INDEX "cost_snapshots_merchantId_brandId_storeId_idx" ON "cost_snapshots"("merchantId", "brandId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "cost_snapshots_storeId_id_key" ON "cost_snapshots"("storeId", "id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_storeId_categoryId_fkey" FOREIGN KEY ("storeId", "categoryId") REFERENCES "categories"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variants" ADD CONSTRAINT "variants_storeId_productId_fkey" FOREIGN KEY ("storeId", "productId") REFERENCES "products"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_storeId_productId_fkey" FOREIGN KEY ("storeId", "productId") REFERENCES "products"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_storeId_groupId_fkey" FOREIGN KEY ("storeId", "groupId") REFERENCES "modifier_groups"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_storeId_variantId_fkey" FOREIGN KEY ("storeId", "variantId") REFERENCES "variants"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_records" ADD CONSTRAINT "purchase_records_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_records" ADD CONSTRAINT "purchase_records_storeId_ingredientId_fkey" FOREIGN KEY ("storeId", "ingredientId") REFERENCES "ingredients"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_storeId_variantId_fkey" FOREIGN KEY ("storeId", "variantId") REFERENCES "variants"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_storeId_recipeId_fkey" FOREIGN KEY ("storeId", "recipeId") REFERENCES "recipes"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_storeId_ingredientId_fkey" FOREIGN KEY ("storeId", "ingredientId") REFERENCES "ingredients"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_items" ADD CONSTRAINT "packaging_items_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_configurations" ADD CONSTRAINT "packaging_configurations_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packaging_configurations" ADD CONSTRAINT "packaging_configurations_storeId_variantId_fkey" FOREIGN KEY ("storeId", "variantId") REFERENCES "variants"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku_packaging" ADD CONSTRAINT "sku_packaging_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku_packaging" ADD CONSTRAINT "sku_packaging_storeId_configurationId_fkey" FOREIGN KEY ("storeId", "configurationId") REFERENCES "packaging_configurations"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sku_packaging" ADD CONSTRAINT "sku_packaging_storeId_packagingItemId_fkey" FOREIGN KEY ("storeId", "packagingItemId") REFERENCES "packaging_items"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_fixed_costs" ADD CONSTRAINT "monthly_fixed_costs_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_allocation_rules" ADD CONSTRAINT "cost_allocation_rules_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_snapshots" ADD CONSTRAINT "cost_snapshots_merchantId_brandId_storeId_fkey" FOREIGN KEY ("merchantId", "brandId", "storeId") REFERENCES "stores"("merchant_id", "brand_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_snapshots" ADD CONSTRAINT "cost_snapshots_storeId_variantId_fkey" FOREIGN KEY ("storeId", "variantId") REFERENCES "variants"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Enforce numeric invariants even for direct database writes.
ALTER TABLE "variants" ADD CONSTRAINT "variants_valid_values" CHECK ("salePriceFen" >= 0 AND "stockQuantity" >= 0 AND "reservedQuantity" >= 0 AND "stockQuantity" >= "reservedQuantity");
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_valid_values" CHECK ("minSelections" >= 0 AND "maxSelections" >= "minSelections" AND "maxSelections" > 0);
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_valid_values" CHECK ("salePriceFen" >= 0);
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_valid_values" CHECK ("lossRateBps" >= 0 AND "lossRateBps" < 10000 AND "baseUnit" IN ('g','ml','each'));
ALTER TABLE "purchase_records" ADD CONSTRAINT "purchase_records_valid_values" CHECK ("totalCostFen" >= 0 AND "quantity" ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$' AND "quantity"::numeric > 0 AND "unit" IN ('g','kg','ml','L','each'));
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_valid_values" CHECK ("version" > 0 AND "yieldQuantity" > 0 AND "laborSeconds" >= 0 AND "otherVariableCostFen" >= 0);
ALTER TABLE "recipe_items" ADD CONSTRAINT "recipe_items_valid_values" CHECK ("quantity" ~ '^(0|[1-9][0-9]{0,11})(\.[0-9]{1,6})?$' AND "quantity"::numeric > 0 AND "unit" IN ('g','kg','ml','L','each'));
ALTER TABLE "packaging_items" ADD CONSTRAINT "packaging_items_valid_values" CHECK ("unitCostFen" >= 0 AND "scope" IN ('SKU','ORDER'));
ALTER TABLE "sku_packaging" ADD CONSTRAINT "sku_packaging_valid_values" CHECK ("quantity" > 0);
ALTER TABLE "packaging_configurations" ADD CONSTRAINT "packaging_configurations_valid_values" CHECK ("fulfillment" IN ('DELIVERY','PICKUP','DINE_IN'));
ALTER TABLE "monthly_fixed_costs" ADD CONSTRAINT "monthly_fixed_costs_valid_values" CHECK ("rentFen" >= 0 AND "utilitiesFen" >= 0 AND "payrollFen" >= 0 AND "propertyFeeFen" >= 0 AND "depreciationFen" >= 0 AND "softwareFen" >= 0 AND "otherFen" >= 0 AND "month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "cost_allocation_rules" ADD CONSTRAINT "cost_allocation_rules_valid_values" CHECK ("expectedMonthlyOrders" > 0 AND "expectedMonthlyItems" > 0 AND "laborFenPerMinute" >= 0 AND "method" IN ('ITEM','ORDER') AND "month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
CREATE UNIQUE INDEX "recipes_one_active" ON "recipes" ("storeId", "variantId") WHERE "active" = true;

