import { prisma } from "@/lib/prisma";
import type { AutoWorkflowStep, AutoWorkflowStatus } from "@/lib/auto-workflow/auto-workflow-types";

function summarize(text: string, max = 500) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 3)}...`;
}

export function getAutoWorkflowStatus(steps: AutoWorkflowStep[]): AutoWorkflowStatus {
  if (steps.some((step) => step.status === "failed")) return "failed";
  if (steps.some((step) => step.status === "partial")) return "partial";
  return "success";
}

export function getAutoGenerationStatus(status: AutoWorkflowStatus) {
  if (status === "failed") return "failed" as const;
  if (status === "partial") return "partial" as const;
  return "success" as const;
}

export async function writeAutoWorkflowLog(params: {
  action: string;
  inputSummary: string;
  steps: AutoWorkflowStep[];
  warnings: string[];
}) {
  const status = getAutoWorkflowStatus(params.steps);

  await prisma.generationLog.create({
    data: {
      action: params.action,
      provider: "system",
      model: "auto-workflow-runner",
      inputSummary: summarize(params.inputSummary),
      outputSummary: summarize(
        `status=${status}, steps=${params.steps
          .map((step) => `${step.step}:${step.status}`)
          .join(", ")}, warnings=${params.warnings.length}`,
      ),
      status: status === "failed" ? "failed" : "success",
      generationStatus: status,
      errorMessage: params.warnings.length > 0 ? summarize(params.warnings.join(" / ")) : null,
    },
  });
}
