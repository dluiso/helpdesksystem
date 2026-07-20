ALTER TABLE "project_milestones"
  ADD COLUMN "assignedUserId" UUID;

CREATE INDEX "project_milestones_assignedUserId_idx" ON "project_milestones"("assignedUserId");

ALTER TABLE "project_milestones"
  ADD CONSTRAINT "project_milestones_assignedUserId_fkey"
  FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
