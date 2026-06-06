ALTER TABLE "system_settings"
  ADD COLUMN "eventTurnstileEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "eventTurnstileSiteKey" TEXT,
  ADD COLUMN "eventTurnstileSecretReference" TEXT;
