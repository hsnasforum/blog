-- CreateTable
CREATE TABLE "BlogProfile" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "blogName" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL,
    "defaultTone" TEXT NOT NULL,
    "preferredStructure" TEXT NOT NULL,
    "forbiddenPhrases" TEXT NOT NULL,
    "seoRules" TEXT NOT NULL,
    "htmlRules" TEXT NOT NULL,
    "tooltipRules" TEXT NOT NULL,
    "imagePromptRules" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "rawTopic" TEXT NOT NULL,
    "memo" TEXT,
    "optionalKeywords" TEXT,
    "avoidTopics" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "blogProfileId" TEXT,
    CONSTRAINT "Topic_blogProfileId_fkey" FOREIGN KEY ("blogProfileId") REFERENCES "BlogProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrendCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "angleRecommendation" TEXT,
    "titleCandidates" TEXT,
    "scoringBasis" TEXT,
    "searchGrowthScore" INTEGER,
    "newsVelocityScore" INTEGER,
    "communityHeatScore" INTEGER,
    "blogFitScore" INTEGER,
    "differentiationScore" INTEGER,
    "lifespanScore" INTEGER,
    "riskPenalty" INTEGER,
    "totalScore" INTEGER,
    "verdict" TEXT,
    "recommendationReason" TEXT,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrendCandidate_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "candidateId" TEXT,
    "blogProfileId" TEXT,
    "title" TEXT NOT NULL,
    "angle" TEXT,
    "outline" TEXT,
    "draft" TEXT,
    "reviewReport" TEXT,
    "seoPackage" TEXT,
    "workflowStep" TEXT NOT NULL DEFAULT 'outline',
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Post_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Post_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "TrendCandidate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Post_blogProfileId_fkey" FOREIGN KEY ("blogProfileId") REFERENCES "BlogProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProviderConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "provider" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GenerationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputSummary" TEXT NOT NULL,
    "outputSummary" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Topic_createdAt_idx" ON "Topic"("createdAt");

-- CreateIndex
CREATE INDEX "TrendCandidate_topicId_totalScore_idx" ON "TrendCandidate"("topicId", "totalScore" DESC);

-- CreateIndex
CREATE INDEX "Post_topicId_createdAt_idx" ON "Post"("topicId", "createdAt");

-- CreateIndex
CREATE INDEX "GenerationLog_createdAt_idx" ON "GenerationLog"("createdAt" DESC);
