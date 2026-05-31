-- Add mailbox connection modes for direct Microsoft Graph and forwarded mailbox workflows.
CREATE TYPE "MailboxConnectionMode" AS ENUM ('GRAPH_DIRECT', 'GRAPH_FORWARDED_MAILBOX', 'MOCK');
CREATE TYPE "MailboxOutboundMode" AS ENUM ('GRAPH_SEND_AS', 'GRAPH_SEND_ON_BEHALF', 'SMTP_RELAY', 'NONE');

ALTER TABLE "mailboxes"
  ADD COLUMN "connectionMode" "MailboxConnectionMode" NOT NULL DEFAULT 'GRAPH_DIRECT',
  ADD COLUMN "publicEmailAddress" TEXT,
  ADD COLUMN "ingestionEmailAddress" TEXT,
  ADD COLUMN "outboundMode" "MailboxOutboundMode" NOT NULL DEFAULT 'GRAPH_SEND_AS',
  ADD COLUMN "outboundFromAddress" TEXT,
  ADD COLUMN "outboundReplyToAddress" TEXT,
  ADD COLUMN "preserveOriginalSenderHeaders" BOOLEAN NOT NULL DEFAULT true;

UPDATE "mailboxes"
SET
  "publicEmailAddress" = "emailAddress",
  "outboundFromAddress" = "emailAddress",
  "outboundReplyToAddress" = "emailAddress";

ALTER TABLE "tickets"
  ADD COLUMN "mailboxId" UUID;

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_mailboxId_fkey"
  FOREIGN KEY ("mailboxId") REFERENCES "mailboxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tickets_mailboxId_idx" ON "tickets"("mailboxId");
