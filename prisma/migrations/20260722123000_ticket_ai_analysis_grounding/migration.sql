ALTER TABLE "ticket_ai_analyses"
ADD COLUMN "contradictions" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "evidence" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "responseReady" BOOLEAN NOT NULL DEFAULT false;
