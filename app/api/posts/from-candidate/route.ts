import { NextResponse } from "next/server";
import { z } from "zod";

import { ensureBlogProfile } from "@/lib/blog-profile";
import { prisma } from "@/lib/prisma";
import { getGenerationMetadata } from "@/lib/writer/generation-status";
import { buildWriterSourceContext } from "@/lib/writer/source-context";
import { WriterService } from "@/lib/writer/writer-service";

const writerService = new WriterService();

const schema = z.object({
  candidateId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "candidateId가 필요합니다." }, { status: 400 });
    }

    const candidate = await prisma.trendCandidate.findUnique({
      where: { id: parsed.data.candidateId },
      include: {
        communitySignals: true,
        officialSources: true,
        topic: {
          include: {
            blogProfile: true,
          },
        },
        posts: true,
      },
    });

    if (!candidate) {
      return NextResponse.json({ error: "후보를 찾을 수 없습니다." }, { status: 404 });
    }

    if (candidate.posts[0]) {
      return NextResponse.json({
        post: candidate.posts[0],
        reused: true,
        generationStatus: "success",
      });
    }

    const profile = candidate.topic.blogProfile ?? (await ensureBlogProfile());
    const sourceContext = buildWriterSourceContext(candidate);

    const angleResult = await writerService.generateAngle({
      rawTopic: candidate.topic.rawTopic,
      keyword: candidate.keyword,
      rationale: candidate.rationale,
      blogProfile: profile,
      sourceContext,
    });
    const angle = angleResult.data;
    const generationMetadata = getGenerationMetadata(angleResult);

    const post = await prisma.post.create({
      data: {
        topicId: candidate.topicId,
        candidateId: candidate.id,
        blogProfileId: profile.id,
        title: angle.title,
        angle: angle.angle,
        workflowStep: "outline",
      },
    });

    await prisma.trendCandidate.update({
      where: { id: candidate.id },
      data: {
        angleRecommendation: angle.reason,
        titleCandidates: JSON.stringify(angle.titleCandidates),
      },
    });

    return NextResponse.json({ post, reused: false, ...generationMetadata }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "기획안 생성 실패",
        generationStatus: "failed",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
