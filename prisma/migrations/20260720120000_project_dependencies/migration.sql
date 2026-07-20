CREATE TABLE "project_dependencies" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "dependsOnProjectId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_dependencies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_dependencies_not_self" CHECK ("projectId" <> "dependsOnProjectId")
);

CREATE UNIQUE INDEX "project_dependencies_projectId_dependsOnProjectId_key" ON "project_dependencies"("projectId", "dependsOnProjectId");
CREATE INDEX "project_dependencies_dependsOnProjectId_idx" ON "project_dependencies"("dependsOnProjectId");

ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_dependsOnProjectId_fkey" FOREIGN KEY ("dependsOnProjectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
