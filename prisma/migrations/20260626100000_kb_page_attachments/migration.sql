ALTER TABLE "knowledge_article_attachments" ADD COLUMN "pageId" UUID;

CREATE INDEX "knowledge_article_attachments_pageId_idx" ON "knowledge_article_attachments"("pageId");

ALTER TABLE "knowledge_article_attachments"
  ADD CONSTRAINT "knowledge_article_attachments_pageId_fkey"
  FOREIGN KEY ("pageId") REFERENCES "knowledge_article_pages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
