-- CreateTable
CREATE TABLE "CommunitySignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "score" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "reactionCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "collectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunitySignal_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "TrendCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CommunitySignal_candidateId_sourceType_idx" ON "CommunitySignal"("candidateId", "sourceType");

-- CreateIndex
CREATE INDEX "CommunitySignal_signalType_idx" ON "CommunitySignal"("signalType");

-- CreateIndex
CREATE INDEX "CommunitySignal_collectedAt_idx" ON "CommunitySignal"("collectedAt");
