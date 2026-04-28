PRAGMA foreign_keys=OFF;

CREATE TABLE "new_CommunitySignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT,
    "candidateId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceTab" TEXT,
    "externalId" TEXT,
    "canonicalUrl" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "observedAt" DATETIME,
    "collectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "reactionCount" INTEGER NOT NULL DEFAULT 0,
    "recommendCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL DEFAULT 'medium',
    "verificationStatus" TEXT NOT NULL DEFAULT 'community_only',
    "confidence" TEXT NOT NULL DEFAULT 'low',
    "rawMetaJson" TEXT,
    "linksJson" TEXT,
    "importMethod" TEXT,
    "importBatchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "errorMessage" TEXT,
    CONSTRAINT "CommunitySignal_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CommunitySignal_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "TrendCandidate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_CommunitySignal" (
    "id",
    "topicId",
    "candidateId",
    "sourceType",
    "sourceName",
    "title",
    "url",
    "publishedAt",
    "collectedAt",
    "score",
    "commentCount",
    "reactionCount",
    "summary",
    "signalType",
    "riskLevel",
    "verificationStatus",
    "confidence",
    "status"
)
SELECT
    cs."id",
    tc."topicId",
    cs."candidateId",
    cs."sourceType",
    cs."sourceName",
    cs."title",
    cs."url",
    cs."publishedAt",
    cs."collectedAt",
    cs."score",
    cs."commentCount",
    cs."reactionCount",
    cs."summary",
    cs."signalType",
    CASE WHEN cs."signalType" = 'rumor' THEN 'high' ELSE 'medium' END,
    CASE WHEN cs."signalType" = 'rumor' THEN 'needs_manual_review' ELSE 'community_only' END,
    'low',
    'success'
FROM "CommunitySignal" cs
LEFT JOIN "TrendCandidate" tc ON tc."id" = cs."candidateId";

DROP TABLE "CommunitySignal";
ALTER TABLE "new_CommunitySignal" RENAME TO "CommunitySignal";

CREATE INDEX "CommunitySignal_topicId_idx" ON "CommunitySignal"("topicId");
CREATE INDEX "CommunitySignal_candidateId_sourceType_idx" ON "CommunitySignal"("candidateId", "sourceType");
CREATE INDEX "CommunitySignal_sourceType_sourceTab_idx" ON "CommunitySignal"("sourceType", "sourceTab");
CREATE INDEX "CommunitySignal_signalType_idx" ON "CommunitySignal"("signalType");
CREATE INDEX "CommunitySignal_riskLevel_idx" ON "CommunitySignal"("riskLevel");
CREATE INDEX "CommunitySignal_verificationStatus_idx" ON "CommunitySignal"("verificationStatus");
CREATE INDEX "CommunitySignal_collectedAt_idx" ON "CommunitySignal"("collectedAt");

PRAGMA foreign_keys=ON;
