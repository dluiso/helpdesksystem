CREATE TABLE "knowledge_article_attachments" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "uploadedByUserId" UUID,
    "storedFileId" UUID NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "storedFilename" TEXT NOT NULL,
    "storageProvider" "FileStorageProvider" NOT NULL DEFAULT 'LOCAL',
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileExtension" TEXT,
    "fileSize" INTEGER NOT NULL,
    "sha256Hash" VARCHAR(64) NOT NULL,
    "isInline" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_article_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "knowledge_article_attachments_articleId_idx" ON "knowledge_article_attachments"("articleId");
CREATE INDEX "knowledge_article_attachments_deletedAt_idx" ON "knowledge_article_attachments"("deletedAt");
CREATE UNIQUE INDEX "knowledge_article_attachments_storedFileId_key" ON "knowledge_article_attachments"("storedFileId");

ALTER TABLE "knowledge_article_attachments" ADD CONSTRAINT "knowledge_article_attachments_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "knowledge_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "knowledge_article_attachments" ADD CONSTRAINT "knowledge_article_attachments_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "knowledge_article_attachments" ADD CONSTRAINT "knowledge_article_attachments_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "stored_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
