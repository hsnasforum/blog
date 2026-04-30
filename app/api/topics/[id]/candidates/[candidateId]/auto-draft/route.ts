import { NextResponse } from "next/server";
import { z } from "zod";

import { runAutoDraftForCandidate } from "@/lib/auto-workflow/auto-draft-service";

const schema = z.object({
  regenerate: z.boolean().optional(),
  runId: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string; candidateId: string } },
) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "autoDraft 요청값 검증 실패", detail: parsed.error.flatten() }, { status: 400 });
    }

    const result = await runAutoDraftForCandidate(params.id, params.candidateId, {
      regenerate: parsed.data.regenerate,
      runId: parsed.data.runId,
    });

    return NextResponse.json(result, { status: result.status === "failed" ? 500 : 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Auto Draft 실행 실패",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
