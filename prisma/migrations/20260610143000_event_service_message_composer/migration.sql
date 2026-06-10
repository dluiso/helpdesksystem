-- Event & Services rich messaging, attachments, and AI audit support.
ALTER TABLE "event_service_messages"
  ADD COLUMN "ccEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "notifiedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "hasAttachments" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ai_request_logs"
  ADD COLUMN "eventServiceRequestId" UUID,
  ALTER COLUMN "ticketId" DROP NOT NULL;

CREATE TABLE "event_service_attachments" (
  "id" UUID NOT NULL,
  "requestId" UUID NOT NULL,
  "messageId" UUID,
  "uploadedByUserId" UUID,
  "storedFileId" UUID NOT NULL,
  "source" "AttachmentSource" NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "storedFilename" TEXT NOT NULL,
  "storageProvider" "FileStorageProvider" NOT NULL DEFAULT 'LOCAL',
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileExtension" TEXT,
  "fileSize" INTEGER NOT NULL,
  "sha256Hash" VARCHAR(64) NOT NULL,
  "isInline" BOOLEAN NOT NULL DEFAULT false,
  "contentId" TEXT,
  "emailAttachmentId" TEXT,
  "scanStatus" "AttachmentScanStatus" NOT NULL DEFAULT 'PENDING',
  "scanResult" "AttachmentScanResult" NOT NULL DEFAULT 'NOT_SCANNED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "event_service_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_service_attachments_storedFileId_key" ON "event_service_attachments"("storedFileId");
CREATE INDEX "event_service_attachments_requestId_idx" ON "event_service_attachments"("requestId");
CREATE INDEX "event_service_attachments_messageId_idx" ON "event_service_attachments"("messageId");
CREATE INDEX "event_service_attachments_uploadedByUserId_idx" ON "event_service_attachments"("uploadedByUserId");
CREATE INDEX "event_service_attachments_scanStatus_idx" ON "event_service_attachments"("scanStatus");
CREATE INDEX "event_service_attachments_deletedAt_idx" ON "event_service_attachments"("deletedAt");
CREATE INDEX "ai_request_logs_eventServiceRequestId_createdAt_idx" ON "ai_request_logs"("eventServiceRequestId", "createdAt");

ALTER TABLE "event_service_attachments"
  ADD CONSTRAINT "event_service_attachments_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "event_service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "event_service_attachments"
  ADD CONSTRAINT "event_service_attachments_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "event_service_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_service_attachments"
  ADD CONSTRAINT "event_service_attachments_uploadedByUserId_fkey"
  FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_service_attachments"
  ADD CONSTRAINT "event_service_attachments_storedFileId_fkey"
  FOREIGN KEY ("storedFileId") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_request_logs"
  ADD CONSTRAINT "ai_request_logs_eventServiceRequestId_fkey"
  FOREIGN KEY ("eventServiceRequestId") REFERENCES "event_service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
