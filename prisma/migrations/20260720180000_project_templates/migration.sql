CREATE TABLE "project_templates" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "createdById" UUID,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "projectStatus" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
  "projectHealth" "ProjectHealth" NOT NULL DEFAULT 'ON_TRACK',
  "durationDays" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_template_milestones" (
  "id" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "ProjectMilestoneStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "dueOffsetDays" INTEGER,
  "assignToOwner" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "project_template_milestones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_template_decisions" (
  "id" UUID NOT NULL,
  "templateId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "dueOffsetDays" INTEGER,
  "assignToOwner" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "project_template_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_templates_organizationId_name_key" ON "project_templates"("organizationId", "name");
CREATE INDEX "project_templates_organizationId_updatedAt_idx" ON "project_templates"("organizationId", "updatedAt");
CREATE INDEX "project_templates_createdById_idx" ON "project_templates"("createdById");
CREATE INDEX "project_template_milestones_templateId_sortOrder_idx" ON "project_template_milestones"("templateId", "sortOrder");
CREATE INDEX "project_template_decisions_templateId_sortOrder_idx" ON "project_template_decisions"("templateId", "sortOrder");

ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_template_milestones" ADD CONSTRAINT "project_template_milestones_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "project_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_template_decisions" ADD CONSTRAINT "project_template_decisions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "project_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
