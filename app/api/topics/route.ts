import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureBlogProfile } from "@/lib/blog-profile";
import { runAutoScoutForTopic } from "@/lib/auto-workflow/auto-scout-service";
import { prisma } from "@/lib/prisma";

const topicSchema = z.object({
  rawTopic: z.string().min(1, "rawTopic은 필수입니다."),
  memo: z.string().optional(),
  optionalKeywords: z.string().optional(),
  avoidTopics: z.string().optional(),
  autoScout: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = topicSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "입력값 검증 실패", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const profile = await ensureBlogProfile();
    const topic = await prisma.topic.create({
      data: {
        rawTopic: parsed.data.rawTopic.trim(),
        memo: parsed.data.memo?.trim() || null,
        optionalKeywords: parsed.data.optionalKeywords?.trim() || null,
        avoidTopics: parsed.data.avoidTopics?.trim() || null,
        blogProfileId: profile.id,
      },
    });

    if (!parsed.data.autoScout) {
      return NextResponse.json({ topic }, { status: 201 });
    }

    const autoScout = await runAutoScoutForTopic(topic.id);
    const updatedTopic = await prisma.topic.findUnique({ where: { id: topic.id } });

    return NextResponse.json({ topic: updatedTopic ?? topic, autoScout }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "토픽 생성 실패", detail: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 },
    );
  }
}
