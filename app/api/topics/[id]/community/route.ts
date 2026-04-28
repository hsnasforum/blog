import { NextResponse } from "next/server";
import { z } from "zod";

import { addManualCommunitySignal } from "@/lib/community/collect-community-signals";
import { communitySignalTypes } from "@/lib/community/community-types";

const manualCommunitySignalSchema = z.object({
  candidateId: z.string().min(1, "candidateId는 필수입니다."),
  sourceName: z.string().min(1, "sourceName은 필수입니다.").max(80),
  url: z.string().url("url 형식이 올바르지 않습니다."),
  title: z.string().min(1, "title은 필수입니다.").max(200),
  summary: z.string().min(1, "summary는 필수입니다.").max(1000),
  signalType: z.enum(communitySignalTypes),
  observedAt: z.string().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json();
    const parsed = manualCommunitySignalSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 검증 실패", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const observedAt = parsed.data.observedAt ? new Date(parsed.data.observedAt) : null;
    if (observedAt && Number.isNaN(observedAt.getTime())) {
      return NextResponse.json({ error: "observedAt 날짜 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const result = await addManualCommunitySignal(
      {
        candidateId: parsed.data.candidateId,
        sourceType: "manual",
        sourceName: parsed.data.sourceName.trim(),
        url: parsed.data.url.trim(),
        title: parsed.data.title.trim(),
        summary: parsed.data.summary.trim(),
        signalType: parsed.data.signalType,
        publishedAt: observedAt,
      },
      params.id,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ signal: result.signal, score: result.score }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "수동 커뮤니티 소스 저장 실패",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
