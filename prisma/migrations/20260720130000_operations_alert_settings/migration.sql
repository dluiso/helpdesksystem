ALTER TABLE "system_settings"
  ADD COLUMN "operationsCapacityBaseline" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "operationsCapacityWarningPercent" INTEGER NOT NULL DEFAULT 75,
  ADD COLUMN "operationsDueSoonDays" INTEGER NOT NULL DEFAULT 7;
