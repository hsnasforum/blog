CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT,
    "candidateId" TEXT,
    "postId" TEXT,
    "runType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "currentStep" TEXT,
    "currentStepLabel" TEXT,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "errorMessage" TEXT,
    "warningsJson" TEXT,
    "resultJson" TEXT,
    CONSTRAINT "WorkflowRun_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkflowRun_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "TrendCandidate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkflowRun_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "WorkflowRunStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "stepLabel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "progressWeight" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "message" TEXT,
    "errorMessage" TEXT,
    "generationLogId" TEXT,
    CONSTRAINT "WorkflowRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WorkflowRun_runType_status_idx" ON "WorkflowRun"("runType", "status");
CREATE INDEX "WorkflowRun_topicId_startedAt_idx" ON "WorkflowRun"("topicId", "startedAt");
CREATE INDEX "WorkflowRun_candidateId_startedAt_idx" ON "WorkflowRun"("candidateId", "startedAt");
CREATE INDEX "WorkflowRun_postId_startedAt_idx" ON "WorkflowRun"("postId", "startedAt");
CREATE UNIQUE INDEX "WorkflowRunStep_runId_stepKey_key" ON "WorkflowRunStep"("runId", "stepKey");
CREATE INDEX "WorkflowRunStep_runId_sortOrder_idx" ON "WorkflowRunStep"("runId", "sortOrder");
CREATE INDEX "WorkflowRunStep_status_idx" ON "WorkflowRunStep"("status");
