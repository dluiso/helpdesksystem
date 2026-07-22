CREATE TABLE "ticket_ai_analysis_translations" (
  "id" UUID NOT NULL,
  "analysisId" UUID NOT NULL,
  "language" VARCHAR(10) NOT NULL,
  "goal" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "recommendedActions" JSONB NOT NULL,
  "missingInformation" JSONB NOT NULL,
  "risks" JSONB NOT NULL,
  "contradictions" JSONB NOT NULL,
  "provider" "AiProvider" NOT NULL DEFAULT 'MOCK',
  "model" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ticket_ai_analysis_translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ticket_ai_analysis_translations_analysisId_language_key"
ON "ticket_ai_analysis_translations"("analysisId", "language");

CREATE INDEX "ticket_ai_analysis_translations_analysisId_idx"
ON "ticket_ai_analysis_translations"("analysisId");

ALTER TABLE "ticket_ai_analysis_translations"
ADD CONSTRAINT "ticket_ai_analysis_translations_analysisId_fkey"
FOREIGN KEY ("analysisId") REFERENCES "ticket_ai_analyses"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
