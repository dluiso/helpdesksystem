CREATE TABLE "system_health_snapshots" (
    "id" UUID NOT NULL,
    "component" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_health_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "system_health_snapshots_component_checkedAt_idx" ON "system_health_snapshots"("component", "checkedAt");
CREATE INDEX "system_health_snapshots_status_checkedAt_idx" ON "system_health_snapshots"("status", "checkedAt");
