ALTER TYPE "TicketStatus" ADD VALUE 'MERGED';

ALTER TABLE "tickets"
ADD COLUMN "mergedIntoTicketId" UUID,
ADD COLUMN "mergedAt" TIMESTAMP(3),
ADD COLUMN "mergedByUserId" UUID,
ADD COLUMN "mergeReason" TEXT;

ALTER TABLE "ticket_messages"
ADD COLUMN "mergedFromTicketId" UUID,
ADD COLUMN "mergedFromTicketNumber" TEXT,
ADD COLUMN "mergedFromTicketSubject" TEXT;

CREATE TABLE "ticket_merges" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "primaryTicketId" UUID NOT NULL,
    "mergedTicketIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "performedByUserId" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_merges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tickets_mergedIntoTicketId_idx" ON "tickets"("mergedIntoTicketId");
CREATE INDEX "tickets_mergedByUserId_idx" ON "tickets"("mergedByUserId");
CREATE INDEX "ticket_messages_mergedFromTicketId_idx" ON "ticket_messages"("mergedFromTicketId");
CREATE INDEX "ticket_merges_organizationId_createdAt_idx" ON "ticket_merges"("organizationId", "createdAt");
CREATE INDEX "ticket_merges_primaryTicketId_idx" ON "ticket_merges"("primaryTicketId");
CREATE INDEX "ticket_merges_performedByUserId_idx" ON "ticket_merges"("performedByUserId");

ALTER TABLE "tickets" ADD CONSTRAINT "tickets_mergedIntoTicketId_fkey" FOREIGN KEY ("mergedIntoTicketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_mergedByUserId_fkey" FOREIGN KEY ("mergedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_mergedFromTicketId_fkey" FOREIGN KEY ("mergedFromTicketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ticket_merges" ADD CONSTRAINT "ticket_merges_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_merges" ADD CONSTRAINT "ticket_merges_primaryTicketId_fkey" FOREIGN KEY ("primaryTicketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_merges" ADD CONSTRAINT "ticket_merges_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "name", "description", "createdAt", "updatedAt")
VALUES ('00000000-0000-0000-0000-000000000104', 'tickets.merge', 'Allows tickets merge', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT (md5(r."id"::text || p."id"::text))::uuid, r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN "permissions" p
WHERE p."name" = 'tickets.merge'
  AND r."name" IN ('Super Admin', 'Admin', 'Manager', 'Technician', 'Client Manager')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
