import { NextResponse } from "next/server";
import { z } from "zod";

import { importDcinsideManualHtml } from "@/lib/community/collectors/dcinside/dcinside-manual-import";
import { dcinsideSourceTabs } from "@/lib/community/collectors/dcinside/dcinside-types";

const importHtmlSchema = z.object({
  sourceTab: z.enum(dcinsideSourceTabs),
  pageUrl: z.string().url("pageUrl 형식이 올바르지 않습니다.").optional().or(z.literal("")),
  html: z.string().min(1, "html은 필수입니다."),
  candidateId: z.string().optional().or(z.literal("")),
  mode: z.enum(["preview", "save"]).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json();
    const parsed = importHtmlSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 검증 실패", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const result = await importDcinsideManualHtml({
      topicId: params.id,
      sourceTab: parsed.data.sourceTab,
      pageUrl: parsed.data.pageUrl || null,
      html: parsed.data.html,
      candidateId: parsed.data.candidateId || null,
      mode: parsed.data.mode ?? "save",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      mode: result.mode,
      importBatchId: "importBatchId" in result ? result.importBatchId : null,
      importedCount: result.importedCount,
      skippedCount: result.skippedCount,
      skipReasonSummary: result.skipReasonSummary,
      parserVersion: result.parserVersion,
      detectedSourceTab: result.detectedSourceTab,
      sourceTabMismatch: result.sourceTabMismatch,
      warnings: result.warnings,
      signals: result.signals,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "DCInside HTML Import 실패",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
