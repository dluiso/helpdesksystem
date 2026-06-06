ALTER TABLE "system_settings"
  ADD COLUMN "passwordResetEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "passwordResetTokenTtlMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "mfaUserManagedEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "mfaRequiredForAdmins" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaRequiredForAllUsers" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "turnstileEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "turnstileSiteKey" TEXT,
  ADD COLUMN "turnstileSecretReference" TEXT,
  ADD COLUMN "turnstileProtectLogin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "turnstileProtectPasswordReset" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "password_reset_tokens" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mfa_login_challenges" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  CONSTRAINT "mfa_login_challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "mfa_setup_challenges" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "secretEncrypted" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "mfa_setup_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");
CREATE INDEX "password_reset_tokens_organizationId_idx" ON "password_reset_tokens"("organizationId");
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

CREATE UNIQUE INDEX "mfa_login_challenges_tokenHash_key" ON "mfa_login_challenges"("tokenHash");
CREATE INDEX "mfa_login_challenges_organizationId_idx" ON "mfa_login_challenges"("organizationId");
CREATE INDEX "mfa_login_challenges_userId_idx" ON "mfa_login_challenges"("userId");
CREATE INDEX "mfa_login_challenges_expiresAt_idx" ON "mfa_login_challenges"("expiresAt");

CREATE UNIQUE INDEX "mfa_setup_challenges_tokenHash_key" ON "mfa_setup_challenges"("tokenHash");
CREATE INDEX "mfa_setup_challenges_organizationId_idx" ON "mfa_setup_challenges"("organizationId");
CREATE INDEX "mfa_setup_challenges_userId_idx" ON "mfa_setup_challenges"("userId");
CREATE INDEX "mfa_setup_challenges_expiresAt_idx" ON "mfa_setup_challenges"("expiresAt");

ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mfa_login_challenges" ADD CONSTRAINT "mfa_login_challenges_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mfa_login_challenges" ADD CONSTRAINT "mfa_login_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mfa_setup_challenges" ADD CONSTRAINT "mfa_setup_challenges_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mfa_setup_challenges" ADD CONSTRAINT "mfa_setup_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
