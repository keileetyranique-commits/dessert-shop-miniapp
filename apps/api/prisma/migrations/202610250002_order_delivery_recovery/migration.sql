-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryQuoteId" UUID;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_storeId_deliveryQuoteId_fkey" FOREIGN KEY ("storeId", "deliveryQuoteId") REFERENCES "mock_delivery_quotes"("storeId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
