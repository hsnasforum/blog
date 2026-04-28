CREATE TABLE "OfficialSource" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "candidateId" TEXT NOT NULL,
  "communitySignalId" TEXT,
  "sourceType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "note" TEXT,
  "verificationStatus" TEXT NOT NULL,
  "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "OfficialSource_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "TrendCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OfficialSource_communitySignalId_fkey" FOREIGN KEY ("communitySignalId") REFERENCES "CommunitySignal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "OfficialSource_candidateId_idx" ON "OfficialSource"("candidateId");
CREATE INDEX "OfficialSource_communitySignalId_idx" ON "OfficialSource"("communitySignalId");
CREATE INDEX "OfficialSource_verificationStatus_idx" ON "OfficialSource"("verificationStatus");
CREATE INDEX "OfficialSource_sourceType_idx" ON "OfficialSource"("sourceType");
