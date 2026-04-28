-- CreateTable
CREATE TABLE "TrendSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "rawSummary" TEXT NOT NULL,
    "linksJson" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "errorMessage" TEXT,
    "collectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrendSignal_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "TrendCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "TrendSignal_candidateId_source_idx" ON "TrendSignal"("candidateId", "source");

-- CreateIndex
CREATE INDEX "TrendSignal_collectedAt_idx" ON "TrendSignal"("collectedAt");
