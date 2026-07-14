ALTER TABLE "system_settings"
  ADD COLUMN "microsoftSsoEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "microsoftSsoTenantId" TEXT,
  ADD COLUMN "microsoftSsoClientId" TEXT,
  ADD COLUMN "microsoftSsoClientSecretReference" TEXT;

ALTER TABLE "users"
  ADD COLUMN "microsoftTenantId" TEXT,
  ADD COLUMN "microsoftObjectId" TEXT,
  ADD COLUMN "microsoftPrincipalName" TEXT,
  ADD COLUMN "microsoftLinkedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_microsoftTenantId_microsoftObjectId_key" ON "users"("microsoftTenantId", "microsoftObjectId");

CREATE TABLE "microsoft_sso_login_challenges" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "stateHash" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "codeVerifierEncrypted" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "microsoft_sso_login_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "microsoft_sso_login_challenges_stateHash_key" ON "microsoft_sso_login_challenges"("stateHash");
CREATE INDEX "microsoft_sso_login_challenges_organizationId_idx" ON "microsoft_sso_login_challenges"("organizationId");
CREATE INDEX "microsoft_sso_login_challenges_expiresAt_idx" ON "microsoft_sso_login_challenges"("expiresAt");

ALTER TABLE "microsoft_sso_login_challenges"
  ADD CONSTRAINT "microsoft_sso_login_challenges_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
