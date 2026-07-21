ALTER TABLE "tickets" ADD COLUMN "targetDate" TIMESTAMP(3);

CREATE INDEX "tickets_targetDate_idx" ON "tickets"("targetDate");
