ALTER TABLE "event_service_services"
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "event_service_services"
SET "sortOrder" = ranked.row_number * 10
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "organizationId" ORDER BY name ASC) AS row_number
  FROM "event_service_services"
) AS ranked
WHERE "event_service_services".id = ranked.id;

CREATE INDEX "event_service_services_organizationId_sortOrder_idx" ON "event_service_services"("organizationId", "sortOrder");
