CREATE TABLE "report_definitions" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "reportType" TEXT NOT NULL DEFAULT 'ticket-report',
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_definitions_organizationId_name_key" ON "report_definitions"("organizationId", "name");
CREATE INDEX "report_definitions_organizationId_reportType_idx" ON "report_definitions"("organizationId", "reportType");
CREATE INDEX "report_definitions_createdById_idx" ON "report_definitions"("createdById");

ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_definitions" ADD CONSTRAINT "report_definitions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
