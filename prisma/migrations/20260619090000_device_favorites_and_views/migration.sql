-- CreateEnum
CREATE TYPE "DeviceViewScope" AS ENUM ('PRIVATE', 'ADMINISTRATORS');

-- CreateTable
CREATE TABLE "user_device_favorites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_device_favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_device_views" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "scope" "DeviceViewScope" NOT NULL DEFAULT 'PRIVATE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_device_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_device_favorites_userId_deviceId_key" ON "user_device_favorites"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "user_device_favorites_deviceId_idx" ON "user_device_favorites"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "user_device_views_userId_name_key" ON "user_device_views"("userId", "name");

-- CreateIndex
CREATE INDEX "user_device_views_organizationId_scope_idx" ON "user_device_views"("organizationId", "scope");

-- CreateIndex
CREATE INDEX "user_device_views_userId_isDefault_idx" ON "user_device_views"("userId", "isDefault");

-- AddForeignKey
ALTER TABLE "user_device_favorites" ADD CONSTRAINT "user_device_favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_device_favorites" ADD CONSTRAINT "user_device_favorites_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_device_views" ADD CONSTRAINT "user_device_views_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_device_views" ADD CONSTRAINT "user_device_views_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
