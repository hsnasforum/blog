import { NextResponse } from "next/server";

import { collectCommunitySignalsForTopic } from "@/lib/community/collect-community-signals";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const result = await collectCommunitySignalsForTopic(params.id);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      topicId: result.topicId,
      collectionStatus: result.collectionStatus,
      signalCount: result.signalCount,
      warning: result.warning,
      warnings: result.warnings,
      candidates: result.candidates,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "커뮤니티 신호 수집 실패",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
