CREATE TYPE "ProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ProjectHealth" AS ENUM ('ON_TRACK', 'AT_RISK', 'OFF_TRACK');
CREATE TYPE "ProjectMilestoneStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED');

CREATE TABLE "projects" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "clientId" UUID,
  "ownerId" UUID,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "ProjectStatus" NOT NULL DEFAULT 'PLANNING',
  "health" "ProjectHealth" NOT NULL DEFAULT 'ON_TRACK',
  "startAt" TIMESTAMP(3),
  "targetDate" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_milestones" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "ProjectMilestoneStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "project_work_items" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "ticketId" UUID,
  "eventServiceRequestId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_work_items_source_check" CHECK (("ticketId" IS NOT NULL AND "eventServiceRequestId" IS NULL) OR ("ticketId" IS NULL AND "eventServiceRequestId" IS NOT NULL)),
  CONSTRAINT "project_work_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "projects_organizationId_status_updatedAt_idx" ON "projects"("organizationId", "status", "updatedAt");
CREATE INDEX "projects_clientId_idx" ON "projects"("clientId");
CREATE INDEX "projects_ownerId_idx" ON "projects"("ownerId");
CREATE INDEX "projects_targetDate_idx" ON "projects"("targetDate");
CREATE INDEX "projects_deletedAt_idx" ON "projects"("deletedAt");
CREATE INDEX "project_milestones_projectId_dueAt_idx" ON "project_milestones"("projectId", "dueAt");
CREATE UNIQUE INDEX "project_work_items_projectId_ticketId_key" ON "project_work_items"("projectId", "ticketId");
CREATE UNIQUE INDEX "project_work_items_projectId_eventServiceRequestId_key" ON "project_work_items"("projectId", "eventServiceRequestId");
CREATE INDEX "project_work_items_ticketId_idx" ON "project_work_items"("ticketId");
CREATE INDEX "project_work_items_eventServiceRequestId_idx" ON "project_work_items"("eventServiceRequestId");

ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_work_items" ADD CONSTRAINT "project_work_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_work_items" ADD CONSTRAINT "project_work_items_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_work_items" ADD CONSTRAINT "project_work_items_eventServiceRequestId_fkey" FOREIGN KEY ("eventServiceRequestId") REFERENCES "event_service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "name", "description", "createdAt", "updatedAt")
VALUES
  (md5('permission:projects.view')::uuid, 'projects.view', 'Allows project planning view', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('permission:projects.create')::uuid, 'projects.create', 'Allows project creation', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('permission:projects.update')::uuid, 'projects.update', 'Allows project updates', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('permission:projects.delete')::uuid, 'projects.delete', 'Allows project deletion', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE SET "description" = EXCLUDED."description", "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT md5('role_permission:' || r."id"::text || ':' || p."id"::text)::uuid, r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON p."name" IN ('projects.view', 'projects.create', 'projects.update', 'projects.delete')
WHERE r."name" IN ('Super Admin', 'Admin', 'Manager')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT md5('role_permission:' || r."id"::text || ':' || p."id"::text)::uuid, r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
JOIN "permissions" p ON p."name" = 'projects.view'
WHERE r."name" = 'Technician'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
