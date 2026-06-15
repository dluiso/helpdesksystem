CREATE TABLE "support_portal_form_sections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "formId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "sectionKey" TEXT NOT NULL,
  "icon" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "isCore" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "support_portal_form_sections_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "support_portal_form_fields" ADD COLUMN "sectionId" UUID;

CREATE UNIQUE INDEX "support_portal_form_sections_formId_sectionKey_key" ON "support_portal_form_sections"("formId", "sectionKey");
CREATE INDEX "support_portal_form_sections_formId_sortOrder_idx" ON "support_portal_form_sections"("formId", "sortOrder");
CREATE INDEX "support_portal_form_fields_sectionId_sortOrder_idx" ON "support_portal_form_fields"("sectionId", "sortOrder");

ALTER TABLE "support_portal_form_sections"
  ADD CONSTRAINT "support_portal_form_sections_formId_fkey"
  FOREIGN KEY ("formId") REFERENCES "support_portal_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_portal_form_fields"
  ADD CONSTRAINT "support_portal_form_fields_sectionId_fkey"
  FOREIGN KEY ("sectionId") REFERENCES "support_portal_form_sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "support_portal_form_sections" ("formId", "title", "sectionKey", "icon", "sortOrder", "isCore", "isActive")
SELECT "id", 'Requester Information', 'requester', 'user', 10, true, true
FROM "support_portal_forms"
ON CONFLICT ("formId", "sectionKey") DO NOTHING;

INSERT INTO "support_portal_form_sections" ("formId", "title", "sectionKey", "icon", "sortOrder", "isCore", "isActive")
SELECT "id", 'Request Information', 'request', 'clipboard', 20, true, true
FROM "support_portal_forms"
ON CONFLICT ("formId", "sectionKey") DO NOTHING;

INSERT INTO "support_portal_form_sections" ("formId", "title", "sectionKey", "icon", "sortOrder", "isCore", "isActive")
SELECT "id", 'Affected Asset or System', 'asset', 'building', 30, true, true
FROM "support_portal_forms"
ON CONFLICT ("formId", "sectionKey") DO NOTHING;

INSERT INTO "support_portal_form_sections" ("formId", "title", "sectionKey", "icon", "sortOrder", "isCore", "isActive")
SELECT "id", 'Diagnostic Details', 'diagnostics', 'mail', 40, true, true
FROM "support_portal_forms"
ON CONFLICT ("formId", "sectionKey") DO NOTHING;

UPDATE "support_portal_form_fields" field
SET "sectionId" = section."id"
FROM "support_portal_form_sections" section
WHERE section."formId" = field."formId"
  AND section."sectionKey" = 'requester'
  AND field."fieldKey" IN ('requesterName', 'requesterEmail', 'requesterPhone', 'department', 'location', 'supervisor');

UPDATE "support_portal_form_fields" field
SET "sectionId" = section."id"
FROM "support_portal_form_sections" section
WHERE section."formId" = field."formId"
  AND section."sectionKey" = 'request'
  AND field."fieldKey" IN ('requestType', 'subject', 'description', 'occurredAt', 'issueFrequency', 'category', 'hardwareSubcategory', 'softwareSubcategory', 'priority', 'affectedPeople', 'impact');

UPDATE "support_portal_form_fields" field
SET "sectionId" = section."id"
FROM "support_portal_form_sections" section
WHERE section."formId" = field."formId"
  AND section."sectionKey" = 'asset'
  AND field."fieldKey" IN ('deviceName', 'assetTag', 'serialNumber', 'ipAddress', 'systemName', 'systemUrl', 'systemVersion');

UPDATE "support_portal_form_fields" field
SET "sectionId" = section."id"
FROM "support_portal_form_sections" section
WHERE section."formId" = field."formId"
  AND section."sectionKey" = 'diagnostics'
  AND field."sectionId" IS NULL;
