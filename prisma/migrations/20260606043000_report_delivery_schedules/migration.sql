ALTER TABLE "report_exports"
ADD COLUMN "organizationId" UUID,
ADD COLUMN "definitionId" UUID,
ADD COLUMN "recipientEmail" TEXT,
ADD COLUMN "deliveryStatus" TEXT NOT NULL DEFAULT 'downloaded',
ADD COLUMN "errorMessage" TEXT;

ALTER TABLE "report_definitions"
ADD COLUMN "isShared" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "report_schedules" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "definitionId" UUID NOT NULL,
    "createdById" UUID,
    "name" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'weekly',
    "format" TEXT NOT NULL DEFAULT 'pdf',
    "recipientEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "report_exports_organizationId_createdAt_idx" ON "report_exports"("organizationId", "createdAt");
CREATE INDEX "report_exports_definitionId_idx" ON "report_exports"("definitionId");
CREATE INDEX "report_schedules_organizationId_isActive_nextRunAt_idx" ON "report_schedules"("organizationId", "isActive", "nextRunAt");
CREATE INDEX "report_schedules_definitionId_idx" ON "report_schedules"("definitionId");
CREATE INDEX "report_schedules_createdById_idx" ON "report_schedules"("createdById");

ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "report_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "report_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
