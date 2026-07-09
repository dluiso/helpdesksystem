CREATE TABLE "external_specialists" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organizationId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "company" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "external_specialists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "event_service_external_specialists" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "externalSpecialistId" UUID NOT NULL,
  "role" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "event_service_external_specialists_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ticket_external_specialists" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ticketId" UUID NOT NULL,
  "externalSpecialistId" UUID NOT NULL,
  "role" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" UUID,

  CONSTRAINT "ticket_external_specialists_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "event_service_tasks" ADD COLUMN "externalSpecialistId" UUID;

CREATE UNIQUE INDEX "external_specialists_organizationId_email_key" ON "external_specialists"("organizationId", "email");
CREATE INDEX "external_specialists_organizationId_isActive_idx" ON "external_specialists"("organizationId", "isActive");
CREATE INDEX "external_specialists_deletedAt_idx" ON "external_specialists"("deletedAt");
CREATE UNIQUE INDEX "event_service_external_specialists_requestId_externalSpecialistId_key" ON "event_service_external_specialists"("requestId", "externalSpecialistId");
CREATE INDEX "event_service_external_specialists_externalSpecialistId_idx" ON "event_service_external_specialists"("externalSpecialistId");
CREATE UNIQUE INDEX "ticket_external_specialists_ticketId_externalSpecialistId_key" ON "ticket_external_specialists"("ticketId", "externalSpecialistId");
CREATE INDEX "ticket_external_specialists_externalSpecialistId_idx" ON "ticket_external_specialists"("externalSpecialistId");
CREATE INDEX "ticket_external_specialists_createdByUserId_idx" ON "ticket_external_specialists"("createdByUserId");
CREATE INDEX "event_service_tasks_externalSpecialistId_idx" ON "event_service_tasks"("externalSpecialistId");

ALTER TABLE "external_specialists" ADD CONSTRAINT "external_specialists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_service_external_specialists" ADD CONSTRAINT "event_service_external_specialists_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "event_service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_service_external_specialists" ADD CONSTRAINT "event_service_external_specialists_externalSpecialistId_fkey" FOREIGN KEY ("externalSpecialistId") REFERENCES "external_specialists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_external_specialists" ADD CONSTRAINT "ticket_external_specialists_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_external_specialists" ADD CONSTRAINT "ticket_external_specialists_externalSpecialistId_fkey" FOREIGN KEY ("externalSpecialistId") REFERENCES "external_specialists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_external_specialists" ADD CONSTRAINT "ticket_external_specialists_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "event_service_tasks" ADD CONSTRAINT "event_service_tasks_externalSpecialistId_fkey" FOREIGN KEY ("externalSpecialistId") REFERENCES "external_specialists"("id") ON DELETE SET NULL ON UPDATE CASCADE;
