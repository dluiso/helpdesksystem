ALTER TABLE "system_settings"
ADD COLUMN "brandLogoBackgroundColor" TEXT NOT NULL DEFAULT '#ffffff',
ADD COLUMN "brandLogoTransparentBackground" BOOLEAN NOT NULL DEFAULT false;
