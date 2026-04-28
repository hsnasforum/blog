import { NextResponse } from "next/server";
import { z } from "zod";

import { dcinsideSourceTabs } from "@/lib/community/collectors/dcinside/dcinside-types";
import { saveDcinsidePreviewFixture } from "@/lib/community/dcinside-preview-fixture";
import { prisma } from "@/lib/prisma";

const savePreviewFixtureSchema = z.object({
  sourceTab: z.enum(dcinsideSourceTabs),
  preview: z.unknown(),
});

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = await request.json();
    const parsed = savePreviewFixtureSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 검증 실패", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const topic = await prisma.topic.findUnique({
      where: { id: params.id },
      select: { id: true },
    });

    if (!topic) {
      return NextResponse.json({ error: "Topic을 찾을 수 없습니다." }, { status: 404 });
    }

    const result = await saveDcinsidePreviewFixture({
      sourceTab: parsed.data.sourceTab,
      preview: parsed.data.preview,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: "message" in result ? result.message : result.error,
          error: result.error,
          projectRoot: "projectRoot" in result ? result.projectRoot : process.cwd(),
          targetPath: "targetPath" in result ? result.targetPath : null,
        },
        { status: result.status },
      );
    }

    return NextResponse.json({
      ok: true,
      relativePath: result.relativePath,
      absolutePath: result.absolutePath,
      exists: result.exists,
      sizeBytes: result.sizeBytes,
      projectRoot: result.projectRoot,
      path: result.path,
      bytes: result.bytes,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: "QA fixture 저장 후 파일 확인에 실패했습니다.",
        error: "DCInside preview QA fixture 저장 실패",
        detail: error instanceof Error ? error.message : "unknown_error",
        projectRoot: process.cwd(),
      },
      { status: 500 },
    );
  }
}
