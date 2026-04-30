import { NextResponse } from "next/server";

import { getWorkflowRunSnapshot } from "@/lib/auto-workflow/workflow-run-service";

export async function GET(
  _request: Request,
  { params }: { params: { runId: string } },
) {
  const snapshot = await getWorkflowRunSnapshot(params.runId);
  if (!snapshot) {
    return NextResponse.json({ error: "WorkflowRun을 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json(snapshot);
}
