import { NextResponse } from "next/server";

import { collectGitHubIssuesForCandidate } from "@/lib/community/collect-community-signals";

export async function POST(
  _request: Request,
  { params }: { params: { id: string; candidateId: string } },
) {
  try {
    const result = await collectGitHubIssuesForCandidate(params.id, params.candidateId);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      collectionStatus: result.collectionStatus,
      candidate: result.candidate,
      signalCount: result.signalCount,
      signals: result.signals,
      warnings: result.warnings,
      warning: result.warning,
      score: result.score,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "GitHub Issues 보강 검색 실패",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
