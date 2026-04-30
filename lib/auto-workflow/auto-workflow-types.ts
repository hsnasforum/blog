import type { GenerationStatus } from "@/lib/writer/generation-status";

export type AutoWorkflowStepStatus = "success" | "skipped" | "partial" | "failed";
export type WorkflowRunType = "auto_scout" | "auto_draft" | "column_ideas" | "github_boost";
export type WorkflowRunStatus = "queued" | "running" | "success" | "partial" | "failed" | "cancelled";
export type WorkflowRunStepStatus = "pending" | "running" | "success" | "skipped" | "failed";

export type AutoWorkflowStep = {
  step: string;
  status: AutoWorkflowStepStatus;
  message?: string;
};

export type AutoWorkflowStatus = "success" | "partial" | "failed";

export type AutoScoutResult = {
  ok: true;
  topicId: string;
  status: AutoWorkflowStatus;
  generationStatus: GenerationStatus | "partial";
  completedSteps: string[];
  steps: AutoWorkflowStep[];
  candidateCount: number;
  trendSignalCount: number;
  communitySignalCount: number;
  githubSignalCount: number;
  officialSourceCount: number;
  warnings: string[];
};

export type AutoDraftResult = {
  ok: true;
  topicId: string;
  candidateId: string;
  postId: string;
  status: AutoWorkflowStatus;
  generationStatus: GenerationStatus | "partial";
  completedSteps: string[];
  steps: AutoWorkflowStep[];
  failedStep?: string;
  warnings: string[];
};

export type WorkflowRunSnapshot = {
  id: string;
  runType: WorkflowRunType;
  status: WorkflowRunStatus;
  currentStep: string | null;
  currentStepLabel: string | null;
  progressPercent: number;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  warnings: string[];
  result: unknown;
  steps: Array<{
    id: string;
    stepKey: string;
    stepLabel: string;
    status: WorkflowRunStepStatus;
    progressWeight: number;
    startedAt: string | null;
    finishedAt: string | null;
    message: string | null;
    errorMessage: string | null;
    generationLogId: string | null;
  }>;
};
