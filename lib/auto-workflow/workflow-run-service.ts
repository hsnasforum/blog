import { prisma } from "@/lib/prisma";
import type {
  WorkflowRunSnapshot,
  WorkflowRunStatus,
  WorkflowRunStepStatus,
  WorkflowRunType,
} from "@/lib/auto-workflow/auto-workflow-types";
import { getWorkflowRunStepDefinitions } from "@/lib/auto-workflow/workflow-run-definitions";

function parseJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseJsonValue(raw: string | null | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function stringifyJson(value: unknown) {
  return JSON.stringify(value);
}

function normalizeRunStatus(status: string): WorkflowRunStatus {
  if (
    status === "queued" ||
    status === "running" ||
    status === "success" ||
    status === "partial" ||
    status === "failed" ||
    status === "cancelled"
  ) {
    return status;
  }
  return "failed";
}

function normalizeStepStatus(status: string): WorkflowRunStepStatus {
  if (status === "pending" || status === "running" || status === "success" || status === "skipped" || status === "failed") {
    return status;
  }
  return "failed";
}

export async function createWorkflowRun(params: {
  runType: WorkflowRunType;
  topicId?: string | null;
  candidateId?: string | null;
  postId?: string | null;
}) {
  const definitions = getWorkflowRunStepDefinitions(params.runType);
  return prisma.workflowRun.create({
    data: {
      runType: params.runType,
      topicId: params.topicId ?? null,
      candidateId: params.candidateId ?? null,
      postId: params.postId ?? null,
      status: "queued",
      progressPercent: 0,
      warningsJson: "[]",
      steps: {
        create: definitions.map((step, index) => ({
          stepKey: step.stepKey,
          stepLabel: step.stepLabel,
          progressWeight: step.progressWeight,
          sortOrder: index,
        })),
      },
    },
  });
}

export async function ensureWorkflowRun(params: {
  runId?: string | null;
  runType: WorkflowRunType;
  topicId?: string | null;
  candidateId?: string | null;
  postId?: string | null;
}) {
  if (params.runId) {
    const existing = await prisma.workflowRun.findUnique({ where: { id: params.runId } });
    if (existing) return existing;
  }

  return createWorkflowRun(params);
}

export async function getWorkflowRunSnapshot(runId: string): Promise<WorkflowRunSnapshot | null> {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
    include: {
      steps: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!run) return null;

  return {
    id: run.id,
    runType: run.runType as WorkflowRunType,
    status: normalizeRunStatus(run.status),
    currentStep: run.currentStep,
    currentStepLabel: run.currentStepLabel,
    progressPercent: run.progressPercent,
    startedAt: run.startedAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    errorMessage: run.errorMessage,
    warnings: parseJsonArray(run.warningsJson),
    result: parseJsonValue(run.resultJson),
    steps: run.steps.map((step) => ({
      id: step.id,
      stepKey: step.stepKey,
      stepLabel: step.stepLabel,
      status: normalizeStepStatus(step.status),
      progressWeight: step.progressWeight,
      startedAt: step.startedAt?.toISOString() ?? null,
      finishedAt: step.finishedAt?.toISOString() ?? null,
      message: step.message,
      errorMessage: step.errorMessage,
      generationLogId: step.generationLogId,
    })),
  };
}

export async function appendWorkflowRunWarnings(runId: string | null | undefined, warnings: string[]) {
  if (!runId || warnings.length === 0) return;
  const run = await prisma.workflowRun.findUnique({ where: { id: runId } });
  if (!run) return;
  const current = parseJsonArray(run.warningsJson);
  const next = Array.from(new Set([...current, ...warnings.filter(Boolean)]));
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { warningsJson: stringifyJson(next) },
  });
}

export async function markWorkflowStep(
  runId: string | null | undefined,
  stepKey: string,
  status: WorkflowRunStepStatus,
  options: { message?: string | null; errorMessage?: string | null; generationLogId?: string | null } = {},
) {
  if (!runId) return;
  const step = await prisma.workflowRunStep.findUnique({
    where: { runId_stepKey: { runId, stepKey } },
  });
  if (!step) return;

  const now = new Date();
  const runStatus: WorkflowRunStatus = status === "running" ? "running" : status === "failed" ? "failed" : "running";
  await prisma.$transaction([
    prisma.workflowRunStep.update({
      where: { id: step.id },
      data: {
        status,
        startedAt: status === "running" ? step.startedAt ?? now : step.startedAt,
        finishedAt: status === "success" || status === "skipped" || status === "failed" ? now : step.finishedAt,
        message: options.message ?? step.message,
        errorMessage: options.errorMessage ?? step.errorMessage,
        generationLogId: options.generationLogId ?? step.generationLogId,
      },
    }),
    prisma.workflowRun.update({
      where: { id: runId },
      data: {
        status: runStatus,
        currentStep: step.stepKey,
        currentStepLabel: step.stepLabel,
        progressPercent: status === "running" ? Math.max(0, Math.min(99, step.progressWeight - 1)) : step.progressWeight,
        errorMessage: status === "failed" ? options.errorMessage ?? options.message ?? "workflow step failed" : undefined,
      },
    }),
  ]);
}

export async function linkLatestGenerationLogToStep(params: {
  runId?: string | null;
  stepKey: string;
  action: string;
  since?: Date;
}) {
  if (!params.runId) return null;

  const log = await prisma.generationLog.findFirst({
    where: {
      action: params.action,
      createdAt: params.since ? { gte: params.since } : undefined,
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!log) return null;

  await prisma.workflowRunStep.update({
    where: {
      runId_stepKey: {
        runId: params.runId,
        stepKey: params.stepKey,
      },
    },
    data: {
      generationLogId: log.id,
    },
  }).catch(() => undefined);

  return log.id;
}

export async function attachWorkflowRunPost(runId: string | null | undefined, postId: string | null | undefined) {
  if (!runId || !postId) return;
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { postId },
  }).catch(() => undefined);
}

export async function finishWorkflowRun(params: {
  runId?: string | null;
  status: WorkflowRunStatus;
  result?: unknown;
  warnings?: string[];
  errorMessage?: string | null;
}) {
  if (!params.runId) return;
  if (params.warnings?.length) {
    await appendWorkflowRunWarnings(params.runId, params.warnings);
  }
  await prisma.workflowRun.update({
    where: { id: params.runId },
    data: {
      status: params.status,
      progressPercent: params.status === "failed" || params.status === "cancelled" ? undefined : 100,
      finishedAt: new Date(),
      errorMessage: params.errorMessage ?? null,
      resultJson: params.result === undefined ? undefined : stringifyJson(params.result),
    },
  });
}

export async function cancelWorkflowRun(runId: string) {
  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      status: "cancelled",
      finishedAt: new Date(),
      errorMessage: "사용자가 실행을 취소했습니다. 이미 진행 중인 provider 호출은 즉시 중단되지 않을 수 있습니다.",
    },
  });
}
