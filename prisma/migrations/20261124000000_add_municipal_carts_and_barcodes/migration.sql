-- AlterTable
ALTER TABLE "products" ADD COLUMN     "barcode" TEXT;

-- AlterTable
ALTER TABLE "store_audit" ADD COLUMN     "cartId" TEXT;

-- AlterTable
ALTER TABLE "redemptions" ADD COLUMN     "cartId" TEXT;

-- CreateTable
CREATE TABLE "sales_carts" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_cart_items" (
    "cartId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "sales_cart_items_pkey" PRIMARY KEY ("cartId","productId")
);

-- CreateIndex
CREATE INDEX "sales_carts_sellerId_expiresAt_idx" ON "sales_carts"("sellerId", "expiresAt");

-- CreateIndex
CREATE INDEX "sales_carts_buyerId_idx" ON "sales_carts"("buyerId");

-- CreateIndex
CREATE INDEX "sales_carts_expiresAt_idx" ON "sales_carts"("expiresAt");

-- CreateIndex
CREATE INDEX "sales_cart_items_productId_idx" ON "sales_cart_items"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "products_city_state_barcode_key" ON "products"("city", "state", "barcode");

-- CreateIndex
CREATE INDEX "store_audit_actorId_cartId_idx" ON "store_audit"("actorId", "cartId");

-- AddForeignKey
ALTER TABLE "sales_carts" ADD CONSTRAINT "sales_carts_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_carts" ADD CONSTRAINT "sales_carts_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_cart_items" ADD CONSTRAINT "sales_cart_items_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "sales_carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_cart_items" ADD CONSTRAINT "sales_cart_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
