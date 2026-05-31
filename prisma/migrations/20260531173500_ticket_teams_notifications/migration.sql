CREATE TABLE "ticket_teams" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_teams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ticket_team_members" (
    "id" UUID NOT NULL,
    "ticketTeamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_team_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_notification_preferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ticketAssignedToMe" BOOLEAN NOT NULL DEFAULT true,
    "ticketAssignedToMyTeam" BOOLEAN NOT NULL DEFAULT true,
    "ticketReplyOnAssignedTicket" BOOLEAN NOT NULL DEFAULT true,
    "internalNoteOnAssignedTicket" BOOLEAN NOT NULL DEFAULT true,
    "internalNoteMention" BOOLEAN NOT NULL DEFAULT true,
    "routingRuleMatched" BOOLEAN NOT NULL DEFAULT true,
    "ticketReopened" BOOLEAN NOT NULL DEFAULT true,
    "dailyDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tickets" ADD COLUMN "assignedTeamId" UUID;
ALTER TABLE "ticket_routing_rules" ADD COLUMN "assignTeamId" UUID;

CREATE UNIQUE INDEX "ticket_teams_organizationId_name_key" ON "ticket_teams"("organizationId", "name");
CREATE INDEX "ticket_teams_organizationId_isActive_idx" ON "ticket_teams"("organizationId", "isActive");
CREATE UNIQUE INDEX "ticket_team_members_ticketTeamId_userId_key" ON "ticket_team_members"("ticketTeamId", "userId");
CREATE INDEX "ticket_team_members_userId_idx" ON "ticket_team_members"("userId");
CREATE UNIQUE INDEX "user_notification_preferences_userId_key" ON "user_notification_preferences"("userId");
CREATE INDEX "tickets_assignedTeamId_idx" ON "tickets"("assignedTeamId");
CREATE INDEX "ticket_routing_rules_assignTeamId_idx" ON "ticket_routing_rules"("assignTeamId");

ALTER TABLE "ticket_teams" ADD CONSTRAINT "ticket_teams_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_team_members" ADD CONSTRAINT "ticket_team_members_ticketTeamId_fkey" FOREIGN KEY ("ticketTeamId") REFERENCES "ticket_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_team_members" ADD CONSTRAINT "ticket_team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assignedTeamId_fkey" FOREIGN KEY ("assignedTeamId") REFERENCES "ticket_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ticket_routing_rules" ADD CONSTRAINT "ticket_routing_rules_assignTeamId_fkey" FOREIGN KEY ("assignTeamId") REFERENCES "ticket_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
