import { NextResponse } from "next/server";

import { cancelWorkflowRun, getWorkflowRunSnapshot } from "@/lib/auto-workflow/workflow-run-service";

export async function POST(
  _request: Request,
  { params }: { params: { runId: string } },
) {
  await cancelWorkflowRun(params.runId);
  const snapshot = await getWorkflowRunSnapshot(params.runId);

  return NextResponse.json(snapshot);
}
