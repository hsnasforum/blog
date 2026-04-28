import { NextResponse } from "next/server";
import { z } from "zod";

import { connectCommunitySignalToCandidate } from "@/lib/community/community-signal-actions";

const connectSignalSchema = z.object({
  candidateId: z.string().min(1, "candidateId는 필수입니다."),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; signalId: string } },
) {
  try {
    const body = await request.json();
    const parsed = connectSignalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 검증 실패", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await connectCommunitySignalToCandidate(
      params.id,
      params.signalId,
      parsed.data.candidateId,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ signal: result.signal, score: result.score });
  } catch (error) {
    return NextResponse.json(
      {
        error: "커뮤니티 신호 연결 실패",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
