ALTER TABLE "system_settings"
  ADD COLUMN "knowledgeOneNoteImportEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "knowledgeOneNoteTenantId" TEXT,
  ADD COLUMN "knowledgeOneNoteClientId" TEXT,
  ADD COLUMN "knowledgeOneNoteClientSecretReference" TEXT,
  ADD COLUMN "knowledgeOneNoteSourceUserPrincipalName" TEXT,
  ADD COLUMN "knowledgeOneNoteDefaultCategoryId" UUID;

ALTER TABLE "knowledge_articles"
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceExternalId" TEXT,
  ADD COLUMN "sourceUrl" TEXT,
  ADD COLUMN "sourceSyncedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "knowledge_articles_organizationId_sourceType_sourceExternalId_key"
  ON "knowledge_articles"("organizationId", "sourceType", "sourceExternalId")
  WHERE "sourceType" IS NOT NULL AND "sourceExternalId" IS NOT NULL AND "deletedAt" IS NULL;
