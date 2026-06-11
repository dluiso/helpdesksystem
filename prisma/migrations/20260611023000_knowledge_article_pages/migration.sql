ALTER TABLE "knowledge_articles"
  ADD COLUMN "accentColor" TEXT;

CREATE TABLE "knowledge_article_pages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "articleId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "sourceType" TEXT,
  "sourceExternalId" TEXT,
  "sourceUrl" TEXT,
  "sourceSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "knowledge_article_pages_pkey" PRIMARY KEY ("id")
);

INSERT INTO "knowledge_article_pages" (
  "articleId",
  "title",
  "content",
  "sortOrder",
  "sourceType",
  "sourceExternalId",
  "sourceUrl",
  "sourceSyncedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  'Content',
  "content",
  0,
  "sourceType",
  "sourceExternalId",
  "sourceUrl",
  "sourceSyncedAt",
  "createdAt",
  "updatedAt"
FROM "knowledge_articles"
WHERE "deletedAt" IS NULL;

CREATE INDEX "knowledge_article_pages_articleId_sortOrder_idx"
  ON "knowledge_article_pages"("articleId", "sortOrder");

CREATE INDEX "knowledge_article_pages_sourceType_sourceExternalId_idx"
  ON "knowledge_article_pages"("sourceType", "sourceExternalId");

ALTER TABLE "knowledge_article_pages"
  ADD CONSTRAINT "knowledge_article_pages_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "knowledge_articles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
