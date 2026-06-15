ALTER TABLE "system_settings"
  ADD COLUMN "eventPortalBrowserTitle" TEXT NOT NULL DEFAULT 'Schedule Event Support',
  ADD COLUMN "supportPortalBrowserTitle" TEXT NOT NULL DEFAULT 'Support Portal';
