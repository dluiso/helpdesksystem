ALTER TABLE "system_settings"
  ADD COLUMN "remoteAccessAutoSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "remoteAccessAutoSyncIntervalMinutes" INTEGER,
  ADD COLUMN "remoteAccessNextAutoSyncAt" TIMESTAMP(3),
  ADD COLUMN "remoteAccessAutoSyncLockedAt" TIMESTAMP(3);
