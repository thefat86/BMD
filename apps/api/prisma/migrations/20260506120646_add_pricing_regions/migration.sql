-- CreateTable
CREATE TABLE "Region" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultCurrency" TEXT NOT NULL,
    "countryCodes" JSONB NOT NULL,
    "description" TEXT,
    "ppaIndex" INTEGER NOT NULL DEFAULT 100,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "PlanPriceTier" (
    "id" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "regionCode" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "priceCentsYearly" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanPriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanPriceTier_regionCode_idx" ON "PlanPriceTier"("regionCode");

-- CreateIndex
CREATE UNIQUE INDEX "PlanPriceTier_planCode_regionCode_key" ON "PlanPriceTier"("planCode", "regionCode");

-- AddForeignKey
ALTER TABLE "PlanPriceTier" ADD CONSTRAINT "PlanPriceTier_planCode_fkey" FOREIGN KEY ("planCode") REFERENCES "Plan"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanPriceTier" ADD CONSTRAINT "PlanPriceTier_regionCode_fkey" FOREIGN KEY ("regionCode") REFERENCES "Region"("code") ON DELETE CASCADE ON UPDATE CASCADE;
