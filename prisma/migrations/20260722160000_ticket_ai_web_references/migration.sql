ALTER TABLE "ticket_ai_analyses"
ADD COLUMN "webReferences" JSONB NOT NULL DEFAULT '[]';
