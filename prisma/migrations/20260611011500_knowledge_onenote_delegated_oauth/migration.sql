ALTER TABLE "system_settings"
  ADD COLUMN "knowledgeOneNoteRefreshTokenEncrypted" TEXT,
  ADD COLUMN "knowledgeOneNoteConnectedUserEmail" TEXT,
  ADD COLUMN "knowledgeOneNoteConnectedAt" TIMESTAMP(3);
