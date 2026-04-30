import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureBlogProfile } from "@/lib/blog-profile";
import { generateTopicIdeas } from "@/lib/topic-ideas/topic-idea-service";
import {
  appendWorkflowRunWarnings,
  finishWorkflowRun,
  markWorkflowStep,
} from "@/lib/auto-workflow/workflow-run-service";

const topicIdeaSchema = z.object({
  focusKeyword: z.string().optional().default(""),
  runId: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = topicIdeaSchema.parse(await request.json().catch(() => ({})));
    if (body.runId) await markWorkflowStep(body.runId, "load_blog_profile", "running");
    const blogProfile = await ensureBlogProfile();
    if (body.runId) await markWorkflowStep(body.runId, "load_blog_profile", "success", { message: blogProfile.blogName });
    if (body.runId) await markWorkflowStep(body.runId, "analyze_recent_signals", "running");
    if (body.runId) await markWorkflowStep(body.runId, "analyze_recent_signals", "success", { message: "최근 신호를 추천 입력으로 반영합니다." });
    if (body.runId) await markWorkflowStep(body.runId, "generate_topic_ideas", "running");
    const result = await generateTopicIdeas({
      blogProfile,
      focusKeyword: body.focusKeyword,
    });
    if (body.runId) {
      await markWorkflowStep(body.runId, "generate_topic_ideas", "success", {
        message: `추천 칼럼 ${result.ideas.length}개`,
      });
      await markWorkflowStep(body.runId, "score_topic_ideas", "running");
      await markWorkflowStep(body.runId, "score_topic_ideas", "success", { message: "위험도와 검증 상태 계산 완료" });
      await markWorkflowStep(body.runId, "finalize_topic_ideas", "running");
      await markWorkflowStep(body.runId, "finalize_topic_ideas", "success", { message: `추천 칼럼 ${result.ideas.length}개 생성 완료` });
      if (result.fallbackReason) await appendWorkflowRunWarnings(body.runId, [result.fallbackReason]);
      await finishWorkflowRun({
        runId: body.runId,
        status: result.generationStatus === "fallback" ? "partial" : "success",
        warnings: result.fallbackReason ? [result.fallbackReason] : [],
        result: { ideaCount: result.ideas.length, generationStatus: result.generationStatus },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "추천 칼럼 생성 실패",
      },
      { status: 400 },
    );
  }
}
