-- DropIndex
DROP INDEX "user_article_userId_isRead_idx";

-- DropIndex
DROP INDEX "user_article_userId_isSaved_idx";

-- CreateIndex
CREATE INDEX "user_article_userId_isRead_readAt_idx" ON "user_article"("userId", "isRead", "readAt");

-- CreateIndex
CREATE INDEX "user_article_userId_isSaved_savedAt_idx" ON "user_article"("userId", "isSaved", "savedAt");

-- CreateIndex
CREATE INDEX "user_article_articleId_isSaved_idx" ON "user_article"("articleId", "isSaved");
