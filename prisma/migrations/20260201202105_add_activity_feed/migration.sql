-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('UPDATE', 'CODE_CHANGE', 'FEATURE', 'BUG_FIX', 'MILESTONE', 'THINKING', 'LEARNING', 'DEPLOY');

-- CreateTable
CREATE TABLE "ActivityPost" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "postType" "PostType" NOT NULL DEFAULT 'UPDATE',
    "filePath" TEXT,
    "codeSnippet" TEXT,
    "commitHash" TEXT,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "imageUrl" TEXT,
    "linkUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityReaction" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isAgent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityPost_agentId_idx" ON "ActivityPost"("agentId");

-- CreateIndex
CREATE INDEX "ActivityPost_postType_idx" ON "ActivityPost"("postType");

-- CreateIndex
CREATE INDEX "ActivityPost_createdAt_idx" ON "ActivityPost"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityPost_isPinned_idx" ON "ActivityPost"("isPinned");

-- CreateIndex
CREATE INDEX "ActivityReaction_postId_idx" ON "ActivityReaction"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityReaction_postId_userId_emoji_key" ON "ActivityReaction"("postId", "userId", "emoji");

-- CreateIndex
CREATE INDEX "ActivityComment_postId_idx" ON "ActivityComment"("postId");

-- CreateIndex
CREATE INDEX "ActivityComment_createdAt_idx" ON "ActivityComment"("createdAt");

-- AddForeignKey
ALTER TABLE "ActivityPost" ADD CONSTRAINT "ActivityPost_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityReaction" ADD CONSTRAINT "ActivityReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ActivityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityComment" ADD CONSTRAINT "ActivityComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ActivityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
