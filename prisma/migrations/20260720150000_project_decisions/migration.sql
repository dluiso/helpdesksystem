CREATE TYPE "ProjectDecisionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED');

CREATE TABLE "project_decisions" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "ownerId" UUID,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "resolution" TEXT,
  "status" "ProjectDecisionStatus" NOT NULL DEFAULT 'OPEN',
  "dueAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_decisions_projectId_status_dueAt_idx" ON "project_decisions"("projectId", "status", "dueAt");
CREATE INDEX "project_decisions_ownerId_idx" ON "project_decisions"("ownerId");

ALTER TABLE "project_decisions"
  ADD CONSTRAINT "project_decisions_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_decisions"
  ADD CONSTRAINT "project_decisions_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
