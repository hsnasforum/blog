import { NextResponse } from "next/server";

import { createCandidateFromCommunitySignal } from "@/lib/community/community-signal-actions";

export async function POST(
  _request: Request,
  { params }: { params: { id: string; signalId: string } },
) {
  try {
    const result = await createCandidateFromCommunitySignal(params.id, params.signalId);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ candidate: result.candidate }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "커뮤니티 신호 기반 후보 생성 실패",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
