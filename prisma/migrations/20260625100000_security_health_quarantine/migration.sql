-- Add organization scoping to audit logs.
ALTER TABLE "audit_logs" ADD COLUMN "organizationId" UUID;

UPDATE "audit_logs"
SET "organizationId" = "users"."organizationId"
FROM "users"
WHERE "audit_logs"."userId" = "users"."id"
  AND "audit_logs"."organizationId" IS NULL;

CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Track admin-approved antivirus false-positive restores without moving files.
ALTER TABLE "ticket_attachments" ADD COLUMN "scanOverriddenAt" TIMESTAMP(3);
ALTER TABLE "ticket_attachments" ADD COLUMN "scanOverrideReason" TEXT;
ALTER TABLE "ticket_attachments" ADD COLUMN "scanOverriddenById" UUID;
CREATE INDEX "ticket_attachments_scanResult_idx" ON "ticket_attachments"("scanResult");
CREATE INDEX "ticket_attachments_scanOverriddenById_idx" ON "ticket_attachments"("scanOverriddenById");
ALTER TABLE "ticket_attachments"
  ADD CONSTRAINT "ticket_attachments_scanOverriddenById_fkey"
  FOREIGN KEY ("scanOverriddenById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "event_service_attachments" ADD COLUMN "scanOverriddenAt" TIMESTAMP(3);
ALTER TABLE "event_service_attachments" ADD COLUMN "scanOverrideReason" TEXT;
ALTER TABLE "event_service_attachments" ADD COLUMN "scanOverriddenById" UUID;
CREATE INDEX "event_service_attachments_scanResult_idx" ON "event_service_attachments"("scanResult");
CREATE INDEX "event_service_attachments_scanOverriddenById_idx" ON "event_service_attachments"("scanOverriddenById");
ALTER TABLE "event_service_attachments"
  ADD CONSTRAINT "event_service_attachments_scanOverriddenById_fkey"
  FOREIGN KEY ("scanOverriddenById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
