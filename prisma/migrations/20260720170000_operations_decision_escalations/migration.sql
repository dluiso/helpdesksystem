ALTER TABLE "system_settings"
  ADD COLUMN "operationsDecisionEscalationUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "operationsDecisionDailyDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "operationsDecisionDailyDigestTime" TEXT NOT NULL DEFAULT '08:00';

CREATE TABLE "project_decision_digests" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "recipientUserId" UUID NOT NULL,
  "digestDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_decision_digests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_decision_digests_organizationId_recipientUserId_digestDate_key" ON "project_decision_digests"("organizationId", "recipientUserId", "digestDate");
CREATE INDEX "project_decision_digests_recipientUserId_createdAt_idx" ON "project_decision_digests"("recipientUserId", "createdAt");

ALTER TABLE "project_decision_digests"
  ADD CONSTRAINT "project_decision_digests_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_decision_digests"
  ADD CONSTRAINT "project_decision_digests_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
