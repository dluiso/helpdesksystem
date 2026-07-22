CREATE TABLE "ticket_ai_analyses" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "ticketId" UUID NOT NULL,
  "createdByUserId" UUID,
  "goal" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "recommendedActions" JSONB NOT NULL,
  "missingInformation" JSONB NOT NULL,
  "risks" JSONB NOT NULL,
  "suggestedResponse" TEXT,
  "confidence" DOUBLE PRECISION,
  "contextHash" TEXT NOT NULL,
  "sourceLastMessageAt" TIMESTAMP(3),
  "provider" "AiProvider" NOT NULL DEFAULT 'MOCK',
  "model" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ticket_ai_analyses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ticket_ai_analyses_organizationId_createdAt_idx" ON "ticket_ai_analyses"("organizationId", "createdAt");
CREATE INDEX "ticket_ai_analyses_ticketId_createdAt_idx" ON "ticket_ai_analyses"("ticketId", "createdAt");

ALTER TABLE "ticket_ai_analyses" ADD CONSTRAINT "ticket_ai_analyses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_ai_analyses" ADD CONSTRAINT "ticket_ai_analyses_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ticket_ai_analyses" ADD CONSTRAINT "ticket_ai_analyses_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
