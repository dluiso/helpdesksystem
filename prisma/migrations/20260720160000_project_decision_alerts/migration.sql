CREATE TYPE "ProjectDecisionAlertReason" AS ENUM ('UNASSIGNED', 'OVERDUE', 'PROJECT_AT_RISK');

CREATE TABLE "project_decision_alerts" (
  "id" UUID NOT NULL,
  "decisionId" UUID NOT NULL,
  "recipientUserId" UUID NOT NULL,
  "reason" "ProjectDecisionAlertReason" NOT NULL,
  "alertDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_decision_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_decision_alerts_decisionId_reason_alertDate_recipientUserId_key" ON "project_decision_alerts"("decisionId", "reason", "alertDate", "recipientUserId");
CREATE INDEX "project_decision_alerts_recipientUserId_createdAt_idx" ON "project_decision_alerts"("recipientUserId", "createdAt");

ALTER TABLE "project_decision_alerts"
  ADD CONSTRAINT "project_decision_alerts_decisionId_fkey"
  FOREIGN KEY ("decisionId") REFERENCES "project_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_decision_alerts"
  ADD CONSTRAINT "project_decision_alerts_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
