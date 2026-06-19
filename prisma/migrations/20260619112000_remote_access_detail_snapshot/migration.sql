ALTER TABLE "remote_access_profiles"
ADD COLUMN "detailSnapshot" JSONB,
ADD COLUMN "detailSyncedAt" TIMESTAMP(3);
