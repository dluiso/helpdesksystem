ALTER TABLE "event_service_requests" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "event_service_requests_deletedAt_idx" ON "event_service_requests"("deletedAt");
