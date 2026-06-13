ALTER TABLE "system_settings"
  ADD COLUMN "supportPortalEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "supportPortalTitle" TEXT NOT NULL DEFAULT 'Submit a Support Request',
  ADD COLUMN "supportPortalIntroText" TEXT,
  ADD COLUMN "supportPortalSuccessMessage" TEXT,
  ADD COLUMN "supportPortalTurnstileEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "supportPortalTurnstileSiteKey" TEXT,
  ADD COLUMN "supportPortalTurnstileSecretReference" TEXT;

CREATE TABLE "support_portal_forms" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "introText" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "support_portal_forms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "support_portal_form_fields" (
  "id" UUID NOT NULL,
  "formId" UUID NOT NULL,
  "type" "EventServiceFieldType" NOT NULL,
  "label" TEXT NOT NULL,
  "fieldKey" TEXT NOT NULL,
  "placeholder" TEXT,
  "helpText" TEXT,
  "options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "isCore" BOOLEAN NOT NULL DEFAULT false,
  "visibilityCondition" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "support_portal_form_fields_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "support_portal_forms_organizationId_slug_key" ON "support_portal_forms"("organizationId", "slug");
CREATE INDEX "support_portal_forms_organizationId_isActive_idx" ON "support_portal_forms"("organizationId", "isActive");
CREATE UNIQUE INDEX "support_portal_form_fields_formId_fieldKey_key" ON "support_portal_form_fields"("formId", "fieldKey");
CREATE INDEX "support_portal_form_fields_formId_sortOrder_idx" ON "support_portal_form_fields"("formId", "sortOrder");

ALTER TABLE "support_portal_forms"
  ADD CONSTRAINT "support_portal_forms_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "support_portal_form_fields"
  ADD CONSTRAINT "support_portal_form_fields_formId_fkey"
  FOREIGN KEY ("formId") REFERENCES "support_portal_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
