ALTER TABLE "tickets" ADD COLUMN "organizationId" UUID;
ALTER TABLE "tickets" ADD COLUMN "senderEmail" TEXT;
ALTER TABLE "tickets" ADD COLUMN "senderDomain" TEXT;

UPDATE "tickets"
SET "organizationId" = COALESCE(
  (SELECT "organizationId" FROM "clients" WHERE "clients"."id" = "tickets"."clientId" LIMIT 1),
  (SELECT "id" FROM "organizations" ORDER BY "createdAt" ASC LIMIT 1)
)
WHERE "organizationId" IS NULL;

ALTER TABLE "tickets" ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ticket_messages" ADD COLUMN "senderEmail" TEXT;
ALTER TABLE "ticket_messages" ADD COLUMN "senderDomain" TEXT;

CREATE TABLE "unmapped_email_domains" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "domain" TEXT NOT NULL,
  "firstSenderEmail" TEXT,
  "lastSenderEmail" TEXT,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedClientId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "unmapped_email_domains_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "unmapped_email_domains_organizationId_domain_key" ON "unmapped_email_domains"("organizationId", "domain");
CREATE INDEX "unmapped_email_domains_organizationId_resolvedAt_idx" ON "unmapped_email_domains"("organizationId", "resolvedAt");
CREATE INDEX "tickets_organizationId_updatedAt_idx" ON "tickets"("organizationId", "updatedAt");
CREATE INDEX "tickets_senderDomain_idx" ON "tickets"("senderDomain");
CREATE INDEX "ticket_messages_senderDomain_idx" ON "ticket_messages"("senderDomain");

ALTER TABLE "unmapped_email_domains"
  ADD CONSTRAINT "unmapped_email_domains_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "unmapped_email_domains"
  ADD CONSTRAINT "unmapped_email_domains_resolvedClientId_fkey"
  FOREIGN KEY ("resolvedClientId") REFERENCES "clients"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
