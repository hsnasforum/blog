import { NextResponse } from "next/server";
import { z } from "zod";

import { createWorkflowRun, getWorkflowRunSnapshot } from "@/lib/auto-workflow/workflow-run-service";

const workflowRunSchema = z.object({
  runType: z.enum(["auto_scout", "auto_draft", "column_ideas", "github_boost"]),
  topicId: z.string().optional().nullable(),
  candidateId: z.string().optional().nullable(),
  postId: z.string().optional().nullable(),
});

export async function POST(request: Request) {
  const parsed = workflowRunSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "WorkflowRun 요청값 검증 실패", detail: parsed.error.flatten() }, { status: 400 });
  }

  const run = await createWorkflowRun(parsed.data);
  const snapshot = await getWorkflowRunSnapshot(run.id);

  return NextResponse.json(snapshot, { status: 201 });
}
