import { NextResponse } from "next/server";

import { collectTrendSignalsForTopic } from "@/lib/trend/collect-trend-signals";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const result = await collectTrendSignalsForTopic(params.id);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      topicId: result.topicId,
      collectionStatus: result.collectionStatus,
      mode: result.mode,
      warning: result.warning,
      candidates: result.candidates,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "외부 트렌드 신호 수집 실패",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
