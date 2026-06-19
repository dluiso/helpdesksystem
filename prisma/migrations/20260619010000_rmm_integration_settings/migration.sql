ALTER TABLE "system_settings"
  ADD COLUMN "remoteAccessProviderName" TEXT NOT NULL DEFAULT 'Tactical RMM',
  ADD COLUMN "remoteAccessApiBaseUrl" TEXT,
  ADD COLUMN "remoteAccessApiKeyReference" TEXT,
  ADD COLUMN "remoteAccessAgentsPath" TEXT NOT NULL DEFAULT '/agents/',
  ADD COLUMN "remoteAccessDashboardUrl" TEXT,
  ADD COLUMN "remoteAccessDeviceUrlTemplate" TEXT,
  ADD COLUMN "remoteAccessLastSyncAt" TIMESTAMP(3),
  ADD COLUMN "remoteAccessLastSyncStatus" TEXT,
  ADD COLUMN "remoteAccessLastSyncMessage" TEXT;
