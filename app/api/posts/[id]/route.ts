import { NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  title: z.string().optional(),
  angle: z.string().nullable().optional(),
  outline: z.string().nullable().optional(),
  draft: z.string().nullable().optional(),
  reviewReport: z.string().nullable().optional(),
  seoPackage: z.string().nullable().optional(),
  workflowStep: z.enum(["outline", "draft", "review", "approved"]).optional(),
});

type WorkflowStep = "outline" | "draft" | "review" | "approved";

const approvableSteps: WorkflowStep[] = ["review", "approved"];

function hasContent(value: string | null | undefined) {
  return Boolean(value?.trim());
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 검증 실패", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const existing = await prisma.post.findUnique({
      where: { id: params.id },
      select: {
        outline: true,
        draft: true,
        reviewReport: true,
        workflowStep: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "포스트를 찾을 수 없습니다." }, { status: 404 });
    }

    if (data.workflowStep === "approved") {
      const outline = data.outline !== undefined ? data.outline : existing.outline;
      const draft = data.draft !== undefined ? data.draft : existing.draft;
      const reviewReport =
        data.reviewReport !== undefined ? data.reviewReport : existing.reviewReport;

      if (!hasContent(outline)) {
        return NextResponse.json(
          { error: "개요가 생성되어야 승인할 수 있습니다." },
          { status: 400 },
        );
      }

      if (!hasContent(draft)) {
        return NextResponse.json(
          { error: "초안 본문이 생성되어야 승인할 수 있습니다." },
          { status: 400 },
        );
      }

      if (!hasContent(reviewReport)) {
        return NextResponse.json(
          { error: "검수 리포트가 생성되어야 승인할 수 있습니다." },
          { status: 400 },
        );
      }

      if (!approvableSteps.includes(existing.workflowStep as WorkflowStep)) {
        return NextResponse.json(
          { error: "검수 단계 이후에만 승인할 수 있습니다." },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.post.update({
      where: { id: params.id },
      data: {
        title: data.title,
        angle: data.angle,
        outline: data.outline,
        draft: data.draft,
        reviewReport: data.reviewReport,
        seoPackage: data.seoPackage,
        workflowStep: data.workflowStep,
        approvedAt: data.workflowStep === "approved" ? new Date() : undefined,
      },
    });

    return NextResponse.json({ post: updated });
  } catch (error) {
    return NextResponse.json(
      {
        error: "포스트 수정 실패",
        generationStatus: "failed",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
