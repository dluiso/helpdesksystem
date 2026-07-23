ALTER TABLE "ticket_messages"
ADD COLUMN "attachmentsProcessedAt" TIMESTAMP(3),
ADD COLUMN "attachmentImportFailures" JSONB NOT NULL DEFAULT '[]';
