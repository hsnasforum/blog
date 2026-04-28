import { NextResponse } from "next/server";
import { z } from "zod";

import { addOfficialSource } from "@/lib/official-source/official-source-service";
import {
  officialSourceTypes,
  officialVerificationStatuses,
} from "@/lib/official-source/official-source-types";

const officialSourceSchema = z.object({
  communitySignalId: z.string().min(1).optional().nullable(),
  sourceType: z.enum(officialSourceTypes),
  title: z.string().min(1, "title은 필수입니다.").max(200),
  url: z.string().url("url 형식이 올바르지 않습니다."),
  note: z.string().max(1000).optional().nullable(),
  verificationStatus: z.enum(officialVerificationStatuses),
}).superRefine((value, ctx) => {
  const note = value.note?.trim() ?? "";
  if ((value.verificationStatus === "contradicted" || value.verificationStatus === "rejected_as_rumor") && !note) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["note"],
      message: "반박됨 또는 루머 처리됨 상태로 저장하려면 note에 근거를 남겨주세요.",
    });
  }
});

export async function POST(
  request: Request,
  { params }: { params: { id: string; candidateId: string } },
) {
  try {
    const body = await request.json();
    const parsed = officialSourceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "공식 출처 입력값 검증 실패", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await addOfficialSource({
      topicId: params.id,
      candidateId: params.candidateId,
      communitySignalId: parsed.data.communitySignalId ?? null,
      sourceType: parsed.data.sourceType,
      title: parsed.data.title,
      url: parsed.data.url,
      note: parsed.data.note,
      verificationStatus: parsed.data.verificationStatus,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(
      {
        source: result.source,
        candidate: result.candidate,
        verificationStatus: result.verificationStatus,
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "공식 출처 저장 실패",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
