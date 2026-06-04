-- CreateEnum
CREATE TYPE "SpamBlockType" AS ENUM ('EMAIL', 'DOMAIN');

-- AlterTable
ALTER TABLE "system_settings"
ADD COLUMN "recycleBinRetentionDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN "lastRecycleBinCleanupAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "spam_block_entries" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "type" "SpamBlockType" NOT NULL,
  "value" TEXT NOT NULL,
  "normalizedValue" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "spam_block_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blocked_inbound_emails" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "mailboxId" UUID,
  "spamBlockEntryId" UUID,
  "senderEmail" TEXT NOT NULL,
  "senderDomain" TEXT,
  "subject" TEXT NOT NULL,
  "emailMessageId" TEXT,
  "emailInternetMessageId" TEXT,
  "emailConversationId" TEXT,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "blocked_inbound_emails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spam_block_entries_organizationId_type_normalizedValue_key" ON "spam_block_entries"("organizationId", "type", "normalizedValue");

-- CreateIndex
CREATE INDEX "spam_block_entries_organizationId_isActive_idx" ON "spam_block_entries"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "spam_block_entries_createdByUserId_idx" ON "spam_block_entries"("createdByUserId");

-- CreateIndex
CREATE INDEX "blocked_inbound_emails_organizationId_createdAt_idx" ON "blocked_inbound_emails"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "blocked_inbound_emails_mailboxId_idx" ON "blocked_inbound_emails"("mailboxId");

-- CreateIndex
CREATE INDEX "blocked_inbound_emails_spamBlockEntryId_idx" ON "blocked_inbound_emails"("spamBlockEntryId");

-- CreateIndex
CREATE INDEX "blocked_inbound_emails_senderEmail_idx" ON "blocked_inbound_emails"("senderEmail");

-- CreateIndex
CREATE INDEX "blocked_inbound_emails_senderDomain_idx" ON "blocked_inbound_emails"("senderDomain");

-- CreateIndex
CREATE INDEX "blocked_inbound_emails_emailMessageId_idx" ON "blocked_inbound_emails"("emailMessageId");

-- CreateIndex
CREATE INDEX "blocked_inbound_emails_emailInternetMessageId_idx" ON "blocked_inbound_emails"("emailInternetMessageId");

-- AddForeignKey
ALTER TABLE "spam_block_entries" ADD CONSTRAINT "spam_block_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spam_block_entries" ADD CONSTRAINT "spam_block_entries_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_inbound_emails" ADD CONSTRAINT "blocked_inbound_emails_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_inbound_emails" ADD CONSTRAINT "blocked_inbound_emails_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "mailboxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_inbound_emails" ADD CONSTRAINT "blocked_inbound_emails_spamBlockEntryId_fkey" FOREIGN KEY ("spamBlockEntryId") REFERENCES "spam_block_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SeedPermissions
INSERT INTO "permissions" ("id", "name", "description", "createdAt", "updatedAt")
VALUES
  (md5('permission:spam.view')::uuid, 'spam.view', 'Allows spam view', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('permission:spam.manage')::uuid, 'spam.manage', 'Allows spam manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('permission:maintenance.view')::uuid, 'maintenance.view', 'Allows maintenance view', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('permission:maintenance.manage')::uuid, 'maintenance.manage', 'Allows maintenance manage', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT md5('role_permission:' || r."id"::text || ':' || p."id"::text)::uuid, r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('Super Admin', 'Admin')
  AND p."name" IN ('spam.view', 'spam.manage', 'maintenance.view', 'maintenance.manage')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
