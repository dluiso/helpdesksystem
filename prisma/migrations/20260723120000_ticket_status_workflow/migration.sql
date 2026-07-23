-- CreateEnum
CREATE TYPE "TicketStatusCategory" AS ENUM (
  'NEW',
  'ACTIVE',
  'WAITING_CUSTOMER',
  'WAITING_STAFF',
  'WAITING_THIRD_PARTY',
  'RESOLVED',
  'CLOSED',
  'CANCELLED',
  'MERGED'
);

-- CreateEnum
CREATE TYPE "TicketWorkflowTrigger" AS ENUM (
  'CUSTOMER_REPLIED',
  'TECHNICIAN_REPLIED',
  'TICKET_ASSIGNED',
  'MANUAL_REOPEN'
);

-- CreateTable
CREATE TABLE "ticket_status_definitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "systemStatus" "TicketStatus" NOT NULL,
  "category" "TicketStatusCategory" NOT NULL,
  "color" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isProtected" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ticket_status_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_workflow_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "trigger" "TicketWorkflowTrigger" NOT NULL,
  "fromStatusIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "targetStatusId" UUID NOT NULL,
  "requirePriorPublicReply" BOOLEAN,
  "reopenWindowDays" INTEGER,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "stopProcessing" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ticket_workflow_rules_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN "statusDefinitionId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "ticket_status_definitions_organizationId_key_key"
ON "ticket_status_definitions"("organizationId", "key");

CREATE INDEX "ticket_status_definitions_organizationId_isActive_sortOrder_idx"
ON "ticket_status_definitions"("organizationId", "isActive", "sortOrder");

CREATE INDEX "ticket_status_definitions_organizationId_systemStatus_idx"
ON "ticket_status_definitions"("organizationId", "systemStatus");

CREATE INDEX "ticket_workflow_rules_organizationId_trigger_isActive_priority_idx"
ON "ticket_workflow_rules"("organizationId", "trigger", "isActive", "priority");

CREATE INDEX "ticket_workflow_rules_targetStatusId_idx"
ON "ticket_workflow_rules"("targetStatusId");

CREATE INDEX "tickets_statusDefinitionId_idx" ON "tickets"("statusDefinitionId");

-- AddForeignKey
ALTER TABLE "ticket_status_definitions"
ADD CONSTRAINT "ticket_status_definitions_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_workflow_rules"
ADD CONSTRAINT "ticket_workflow_rules_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_workflow_rules"
ADD CONSTRAINT "ticket_workflow_rules_targetStatusId_fkey"
FOREIGN KEY ("targetStatusId") REFERENCES "ticket_status_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tickets"
ADD CONSTRAINT "tickets_statusDefinitionId_fkey"
FOREIGN KEY ("statusDefinitionId") REFERENCES "ticket_status_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the existing semantics for every organization.
INSERT INTO "ticket_status_definitions" (
  "organizationId", "key", "name", "systemStatus", "category", "color",
  "sortOrder", "isDefault", "isProtected"
)
SELECT
  organization."id",
  status."key",
  status."name",
  status."systemStatus"::"TicketStatus",
  status."category"::"TicketStatusCategory",
  status."color",
  status."sortOrder",
  status."isDefault",
  status."isProtected"
FROM "organizations" organization
CROSS JOIN (
  VALUES
    ('new', 'New', 'NEW', 'NEW', '#2563EB', 10, true, true),
    ('open', 'Open', 'OPEN', 'ACTIVE', '#0284C7', 20, false, false),
    ('in_progress', 'In Progress', 'IN_PROGRESS', 'ACTIVE', '#7C3AED', 30, false, false),
    ('waiting_on_customer', 'Waiting on Customer', 'WAITING_ON_CUSTOMER', 'WAITING_CUSTOMER', '#D97706', 40, false, false),
    ('waiting_on_technician', 'Waiting on Technician', 'WAITING_ON_TECHNICIAN', 'WAITING_STAFF', '#DC2626', 50, false, false),
    ('waiting_on_third_party', 'Waiting on Third Party', 'WAITING_ON_THIRD_PARTY', 'WAITING_THIRD_PARTY', '#B45309', 60, false, false),
    ('resolved', 'Resolved', 'RESOLVED', 'RESOLVED', '#059669', 70, false, false),
    ('closed', 'Closed', 'CLOSED', 'CLOSED', '#475569', 80, false, true),
    ('reopened', 'Reopened', 'REOPENED', 'ACTIVE', '#E11D48', 90, false, false),
    ('cancelled', 'Cancelled', 'CANCELLED', 'CANCELLED', '#64748B', 100, false, false),
    ('merged', 'Merged', 'MERGED', 'MERGED', '#6366F1', 110, false, true)
) AS status("key", "name", "systemStatus", "category", "color", "sortOrder", "isDefault", "isProtected");

-- Backfill all existing tickets without altering their current semantic status.
UPDATE "tickets" ticket
SET "statusDefinitionId" = definition."id"
FROM "ticket_status_definitions" definition
WHERE definition."organizationId" = ticket."organizationId"
  AND definition."systemStatus" = ticket."status"
  AND definition."key" = lower(ticket."status"::text);

-- Seed behavior-compatible automation rules. These preserve the existing runtime
-- behavior and can be edited after deployment.
INSERT INTO "ticket_workflow_rules" (
  "organizationId", "name", "trigger", "fromStatusIds", "targetStatusId",
  "requirePriorPublicReply", "priority", "stopProcessing", "isActive"
)
SELECT
  organization."id",
  'Customer reply requires technician attention',
  'CUSTOMER_REPLIED'::"TicketWorkflowTrigger",
  ARRAY[]::TEXT[],
  target."id",
  true,
  20,
  true,
  true
FROM "organizations" organization
JOIN "ticket_status_definitions" target
  ON target."organizationId" = organization."id" AND target."key" = 'waiting_on_technician';

INSERT INTO "ticket_workflow_rules" (
  "organizationId", "name", "trigger", "fromStatusIds", "targetStatusId",
  "requirePriorPublicReply", "priority", "stopProcessing", "isActive"
)
SELECT
  organization."id",
  'Reopen completed ticket after customer reply',
  'CUSTOMER_REPLIED'::"TicketWorkflowTrigger",
  ARRAY(
    SELECT source."id"::text
    FROM "ticket_status_definitions" source
    WHERE source."organizationId" = organization."id"
      AND source."systemStatus" IN ('CLOSED', 'RESOLVED', 'CANCELLED')
  ),
  target."id",
  NULL,
  10,
  true,
  true
FROM "organizations" organization
JOIN "ticket_status_definitions" target
  ON target."organizationId" = organization."id" AND target."key" = 'reopened';

INSERT INTO "ticket_workflow_rules" (
  "organizationId", "name", "trigger", "fromStatusIds", "targetStatusId",
  "priority", "stopProcessing", "isActive"
)
SELECT
  organization."id",
  'Public technician reply waits on customer',
  'TECHNICIAN_REPLIED'::"TicketWorkflowTrigger",
  ARRAY[]::TEXT[],
  target."id",
  10,
  true,
  true
FROM "organizations" organization
JOIN "ticket_status_definitions" target
  ON target."organizationId" = organization."id" AND target."key" = 'waiting_on_customer';

-- Permissions
INSERT INTO "permissions" ("id", "name", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'ticket_statuses.view', 'Allows ticket status catalog view', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ticket_statuses.manage', 'Allows ticket status catalog management', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ticket_workflows.manage', 'Allows ticket workflow automation management', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role_permission."roleId", permission."id", CURRENT_TIMESTAMP
FROM "role_permissions" role_permission
JOIN "permissions" ticket_view ON ticket_view."id" = role_permission."permissionId" AND ticket_view."name" = 'tickets.view'
JOIN "permissions" permission ON permission."name" = 'ticket_statuses.view'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role_permission."roleId", permission."id", CURRENT_TIMESTAMP
FROM "role_permissions" role_permission
JOIN "permissions" settings_update ON settings_update."id" = role_permission."permissionId" AND settings_update."name" = 'system_settings.update'
JOIN "permissions" permission ON permission."name" IN ('ticket_statuses.manage', 'ticket_workflows.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
