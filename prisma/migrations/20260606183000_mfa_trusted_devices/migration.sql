ALTER TABLE "system_settings"
  ADD COLUMN "mfaTrustedDeviceDays" INTEGER NOT NULL DEFAULT 30;

CREATE TABLE "mfa_trusted_devices" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "label" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mfa_trusted_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mfa_trusted_devices_tokenHash_key" ON "mfa_trusted_devices"("tokenHash");
CREATE INDEX "mfa_trusted_devices_organizationId_idx" ON "mfa_trusted_devices"("organizationId");
CREATE INDEX "mfa_trusted_devices_userId_idx" ON "mfa_trusted_devices"("userId");
CREATE INDEX "mfa_trusted_devices_expiresAt_idx" ON "mfa_trusted_devices"("expiresAt");
CREATE INDEX "mfa_trusted_devices_revokedAt_idx" ON "mfa_trusted_devices"("revokedAt");

ALTER TABLE "mfa_trusted_devices" ADD CONSTRAINT "mfa_trusted_devices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mfa_trusted_devices" ADD CONSTRAINT "mfa_trusted_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
