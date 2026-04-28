import { NextResponse } from "next/server";

import { ensureBlogProfile } from "@/lib/blog-profile";
import { prisma } from "@/lib/prisma";
import { getGenerationMetadata } from "@/lib/writer/generation-status";
import { WriterService } from "@/lib/writer/writer-service";

const writerService = new WriterService();

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const topic = await prisma.topic.findUnique({
      where: { id: params.id },
    });

    if (!topic) {
      return NextResponse.json({ error: "토픽을 찾을 수 없습니다." }, { status: 404 });
    }

    const blogProfile = topic.blogProfileId
      ? await prisma.blogProfile.findUnique({ where: { id: topic.blogProfileId } })
      : null;
    const profile = blogProfile ?? (await ensureBlogProfile());

    const generated = await writerService.generateKeywordCandidates({
      rawTopic: topic.rawTopic,
      memo: topic.memo,
      optionalKeywords: topic.optionalKeywords,
      avoidTopics: topic.avoidTopics,
      blogProfile: profile,
    });
    const generationMetadata = getGenerationMetadata(generated);

    await prisma.$transaction(async (tx) => {
      await tx.trendCandidate.deleteMany({
        where: { topicId: topic.id },
      });

      if (generated.data.length > 0) {
        await tx.trendCandidate.createMany({
          data: generated.data.map((item) => ({
            topicId: topic.id,
            keyword: item.keyword,
            rationale: item.rationale,
            titleCandidates: JSON.stringify(item.titleCandidates),
            scoringBasis: "estimated_without_external_data",
          })),
        });
      }

      await tx.topic.update({
        where: { id: topic.id },
        data: { status: "candidates_generated" },
      });
    });

    const candidates = await prisma.trendCandidate.findMany({
      where: { topicId: topic.id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(
      { topicId: topic.id, candidates, ...generationMetadata },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "후보 생성 실패",
        generationStatus: "failed",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
