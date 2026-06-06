CREATE TYPE "EventServiceRequestStatus" AS ENUM (
  'NEW',
  'UNDER_REVIEW',
  'SCHEDULED',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_ON_CLIENT',
  'WAITING_ON_INTERNAL_TEAM',
  'COMPLETED',
  'CANCELLED',
  'CONVERTED_TO_TICKET'
);

CREATE TYPE "EventServiceTaskStatus" AS ENUM (
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'DONE',
  'CANCELLED'
);

CREATE TYPE "EventServiceFieldType" AS ENUM (
  'TEXT',
  'TEXTAREA',
  'EMAIL',
  'PHONE',
  'DATE',
  'TIME',
  'SELECT',
  'MULTI_SELECT',
  'CHECKBOX',
  'RADIO',
  'NUMBER'
);

CREATE TABLE "event_service_sequences" (
  "key" TEXT NOT NULL,
  "organizationId" UUID NOT NULL,
  "prefix" TEXT NOT NULL DEFAULT 'EVT',
  "currentValue" INTEGER NOT NULL DEFAULT 100000,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_service_sequences_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "event_service_services" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "icon" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "defaultTeamId" UUID,
  "defaultUserIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_service_services_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_service_forms" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "isPublished" BOOLEAN NOT NULL DEFAULT true,
  "introText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_service_forms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_service_form_fields" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "formId" UUID NOT NULL,
  "type" "EventServiceFieldType" NOT NULL,
  "label" TEXT NOT NULL,
  "fieldKey" TEXT NOT NULL,
  "placeholder" TEXT,
  "helpText" TEXT,
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "options" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_service_form_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_service_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "trackingNumber" TEXT NOT NULL,
  "clientId" UUID,
  "contactId" UUID,
  "linkedTicketId" UUID,
  "assignedTeamId" UUID,
  "eventName" TEXT NOT NULL,
  "organizer" TEXT,
  "venue" TEXT,
  "eventDate" TIMESTAMP(3),
  "startTime" TEXT,
  "endTime" TEXT,
  "requesterFirstName" TEXT NOT NULL,
  "requesterLastName" TEXT NOT NULL,
  "requesterEmail" TEXT NOT NULL,
  "requesterPhone" TEXT,
  "status" "EventServiceRequestStatus" NOT NULL DEFAULT 'NEW',
  "priority" "TicketPriority" NOT NULL DEFAULT 'NORMAL',
  "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "additionalInfo" TEXT,
  "formData" JSONB,
  "submittedFromIp" TEXT,
  "submittedUserAgent" TEXT,
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_service_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_service_request_services" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "serviceId" UUID NOT NULL,
  CONSTRAINT "event_service_request_services_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_service_assignees" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_service_assignees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_service_tasks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "assignedUserId" UUID,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "EventServiceTaskStatus" NOT NULL DEFAULT 'TODO',
  "progressPercent" INTEGER NOT NULL DEFAULT 0,
  "dueAt" TIMESTAMP(3),
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "event_service_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_service_comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "userId" UUID,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_service_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_service_activity" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "userId" UUID,
  "action" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_service_activity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_service_sequences_organizationId_prefix_key" ON "event_service_sequences"("organizationId", "prefix");
CREATE UNIQUE INDEX "event_service_services_organizationId_name_key" ON "event_service_services"("organizationId", "name");
CREATE INDEX "event_service_services_organizationId_isActive_idx" ON "event_service_services"("organizationId", "isActive");
CREATE UNIQUE INDEX "event_service_forms_organizationId_slug_key" ON "event_service_forms"("organizationId", "slug");
CREATE INDEX "event_service_forms_organizationId_isPublished_idx" ON "event_service_forms"("organizationId", "isPublished");
CREATE UNIQUE INDEX "event_service_form_fields_formId_fieldKey_key" ON "event_service_form_fields"("formId", "fieldKey");
CREATE INDEX "event_service_form_fields_formId_sortOrder_idx" ON "event_service_form_fields"("formId", "sortOrder");
CREATE UNIQUE INDEX "event_service_requests_trackingNumber_key" ON "event_service_requests"("trackingNumber");
CREATE INDEX "event_service_requests_organizationId_status_updatedAt_idx" ON "event_service_requests"("organizationId", "status", "updatedAt");
CREATE INDEX "event_service_requests_clientId_idx" ON "event_service_requests"("clientId");
CREATE INDEX "event_service_requests_contactId_idx" ON "event_service_requests"("contactId");
CREATE INDEX "event_service_requests_linkedTicketId_idx" ON "event_service_requests"("linkedTicketId");
CREATE INDEX "event_service_requests_assignedTeamId_idx" ON "event_service_requests"("assignedTeamId");
CREATE INDEX "event_service_requests_eventDate_idx" ON "event_service_requests"("eventDate");
CREATE UNIQUE INDEX "event_service_request_services_requestId_serviceId_key" ON "event_service_request_services"("requestId", "serviceId");
CREATE INDEX "event_service_request_services_serviceId_idx" ON "event_service_request_services"("serviceId");
CREATE UNIQUE INDEX "event_service_assignees_requestId_userId_key" ON "event_service_assignees"("requestId", "userId");
CREATE INDEX "event_service_assignees_userId_idx" ON "event_service_assignees"("userId");
CREATE INDEX "event_service_tasks_requestId_sortOrder_idx" ON "event_service_tasks"("requestId", "sortOrder");
CREATE INDEX "event_service_tasks_assignedUserId_idx" ON "event_service_tasks"("assignedUserId");
CREATE INDEX "event_service_comments_requestId_createdAt_idx" ON "event_service_comments"("requestId", "createdAt");
CREATE INDEX "event_service_comments_userId_idx" ON "event_service_comments"("userId");
CREATE INDEX "event_service_activity_requestId_createdAt_idx" ON "event_service_activity"("requestId", "createdAt");
CREATE INDEX "event_service_activity_userId_idx" ON "event_service_activity"("userId");

ALTER TABLE "event_service_sequences" ADD CONSTRAINT "event_service_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_service_services" ADD CONSTRAINT "event_service_services_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_service_forms" ADD CONSTRAINT "event_service_forms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_service_form_fields" ADD CONSTRAINT "event_service_form_fields_formId_fkey" FOREIGN KEY ("formId") REFERENCES "event_service_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_service_requests" ADD CONSTRAINT "event_service_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_service_requests" ADD CONSTRAINT "event_service_requests_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_service_requests" ADD CONSTRAINT "event_service_requests_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_service_requests" ADD CONSTRAINT "event_service_requests_linkedTicketId_fkey" FOREIGN KEY ("linkedTicketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_service_requests" ADD CONSTRAINT "event_service_requests_assignedTeamId_fkey" FOREIGN KEY ("assignedTeamId") REFERENCES "ticket_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_service_request_services" ADD CONSTRAINT "event_service_request_services_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "event_service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_service_request_services" ADD CONSTRAINT "event_service_request_services_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "event_service_services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_service_assignees" ADD CONSTRAINT "event_service_assignees_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "event_service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_service_assignees" ADD CONSTRAINT "event_service_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_service_tasks" ADD CONSTRAINT "event_service_tasks_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "event_service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_service_tasks" ADD CONSTRAINT "event_service_tasks_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_service_comments" ADD CONSTRAINT "event_service_comments_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "event_service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_service_comments" ADD CONSTRAINT "event_service_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_service_activity" ADD CONSTRAINT "event_service_activity_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "event_service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_service_activity" ADD CONSTRAINT "event_service_activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "name", "description", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'event_services.view', 'Allows event services view', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'event_services.create', 'Allows event services create', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'event_services.update', 'Allows event services update', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'event_services.assign', 'Allows event services assign', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'event_services.manage_forms', 'Allows event services manage forms', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'event_services.delete', 'Allows event services delete', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('Super Admin', 'Admin', 'Manager', 'Technician')
  AND p."name" LIKE 'event_services.%'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" = 'Auditor'
  AND p."name" = 'event_services.view'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
