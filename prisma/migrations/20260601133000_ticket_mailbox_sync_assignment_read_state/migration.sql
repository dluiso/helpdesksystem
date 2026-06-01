ALTER TABLE "mailboxes" ADD COLUMN "autoSyncEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mailboxes" ADD COLUMN "autoSyncIntervalSeconds" INTEGER;
ALTER TABLE "mailboxes" ADD COLUMN "nextAutoSyncAt" TIMESTAMP(3);
ALTER TABLE "mailboxes" ADD COLUMN "autoSyncLockedAt" TIMESTAMP(3);

ALTER TABLE "tickets" ADD COLUMN "firstReadAt" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN "firstReadByUserId" UUID;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_firstReadByUserId_fkey" FOREIGN KEY ("firstReadByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "tickets_firstReadAt_idx" ON "tickets"("firstReadAt");
CREATE INDEX "tickets_firstReadByUserId_idx" ON "tickets"("firstReadByUserId");

CREATE TABLE "ticket_assignees" (
  "id" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "assignedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ticket_assignees_pkey" PRIMARY KEY ("id")
);

INSERT INTO "ticket_assignees" ("id", "ticketId", "userId", "assignedById", "createdAt")
SELECT gen_random_uuid(), "id", "assignedUserId", NULL, CURRENT_TIMESTAMP
FROM "tickets"
WHERE "assignedUserId" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "ticket_assignees_ticketId_userId_key" ON "ticket_assignees"("ticketId", "userId");
CREATE INDEX "ticket_assignees_userId_idx" ON "ticket_assignees"("userId");
CREATE INDEX "ticket_assignees_assignedById_idx" ON "ticket_assignees"("assignedById");
ALTER TABLE "ticket_assignees" ADD CONSTRAINT "ticket_assignees_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_assignees" ADD CONSTRAINT "ticket_assignees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_assignees" ADD CONSTRAINT "ticket_assignees_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ticket_messages" ADD COLUMN "ccEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ticket_messages" ADD COLUMN "notifiedUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
