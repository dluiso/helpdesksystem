-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('UNREAD', 'READ');

-- CreateEnum
CREATE TYPE "RoutingConditionMatch" AS ENUM ('ANY', 'ALL');

-- AlterTable
ALTER TABLE "mailboxes" ADD COLUMN     "initialSyncFrom" TIMESTAMP(3),
ADD COLUMN     "lastSyncError" TEXT,
ADD COLUMN     "lastSyncedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "appliedRoutingRuleId" UUID;

-- CreateTable
CREATE TABLE "ticket_routing_rules" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "mailboxId" UUID,
    "clientId" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "conditionMatch" "RoutingConditionMatch" NOT NULL DEFAULT 'ANY',
    "subjectContains" TEXT,
    "bodyContains" TEXT,
    "senderEmailContains" TEXT,
    "senderDomain" TEXT,
    "assignUserId" UUID,
    "assignGroupId" UUID,
    "notifyUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "setPriority" "TicketPriority",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_watchers" (
    "id" UUID NOT NULL,
    "ticketId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdById" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_watchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "ticketId" UUID,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ticket_routing_rules_organizationId_isActive_priority_idx" ON "ticket_routing_rules"("organizationId", "isActive", "priority");

-- CreateIndex
CREATE INDEX "ticket_routing_rules_mailboxId_idx" ON "ticket_routing_rules"("mailboxId");

-- CreateIndex
CREATE INDEX "ticket_routing_rules_clientId_idx" ON "ticket_routing_rules"("clientId");

-- CreateIndex
CREATE INDEX "ticket_watchers_userId_idx" ON "ticket_watchers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_watchers_ticketId_userId_key" ON "ticket_watchers"("ticketId", "userId");

-- CreateIndex
CREATE INDEX "notifications_userId_status_createdAt_idx" ON "notifications"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_ticketId_idx" ON "notifications"("ticketId");

-- CreateIndex
CREATE INDEX "tickets_appliedRoutingRuleId_idx" ON "tickets"("appliedRoutingRuleId");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_appliedRoutingRuleId_fkey" FOREIGN KEY ("appliedRoutingRuleId") REFERENCES "ticket_routing_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_routing_rules" ADD CONSTRAINT "ticket_routing_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_routing_rules" ADD CONSTRAINT "ticket_routing_rules_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "mailboxes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_routing_rules" ADD CONSTRAINT "ticket_routing_rules_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_routing_rules" ADD CONSTRAINT "ticket_routing_rules_assignUserId_fkey" FOREIGN KEY ("assignUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_routing_rules" ADD CONSTRAINT "ticket_routing_rules_assignGroupId_fkey" FOREIGN KEY ("assignGroupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_watchers" ADD CONSTRAINT "ticket_watchers_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_watchers" ADD CONSTRAINT "ticket_watchers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_watchers" ADD CONSTRAINT "ticket_watchers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
