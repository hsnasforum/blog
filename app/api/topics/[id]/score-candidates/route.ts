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
      include: {
        trendCandidates: true,
        blogProfile: true,
      },
    });

    if (!topic) {
      return NextResponse.json({ error: "토픽을 찾을 수 없습니다." }, { status: 404 });
    }

    if (topic.trendCandidates.length === 0) {
      return NextResponse.json(
        { error: "점수 계산 대상 후보가 없습니다. 먼저 후보를 생성해 주세요." },
        { status: 400 },
      );
    }

    const profile = topic.blogProfile ?? (await ensureBlogProfile());

    const scoredResult = await writerService.scoreTrendCandidates({
      rawTopic: topic.rawTopic,
      memo: topic.memo,
      optionalKeywords: topic.optionalKeywords,
      avoidTopics: topic.avoidTopics,
      blogProfile: profile,
      candidates: topic.trendCandidates.map((candidate) => ({
        id: candidate.id,
        keyword: candidate.keyword,
        rationale: candidate.rationale,
        titleCandidates: candidate.titleCandidates,
        angleRecommendation: candidate.angleRecommendation,
      })),
    });
    const scored = scoredResult.data;
    const generationMetadata = getGenerationMetadata(scoredResult);

    await prisma.$transaction(async (tx) => {
      for (const result of scored) {
        await tx.trendCandidate.update({
          where: { id: result.id },
          data: {
            scoringBasis: result.scoringBasis,
            searchGrowthScore: result.searchGrowthScore,
            newsVelocityScore: result.newsVelocityScore,
            communityHeatScore: result.communityHeatScore,
            blogFitScore: result.blogFitScore,
            differentiationScore: result.differentiationScore,
            lifespanScore: result.lifespanScore,
            riskPenalty: result.riskPenalty,
            totalScore: result.totalScore,
            verdict: result.verdict,
            confidence: result.confidence,
            scoringVersion: result.scoringVersion,
            scoringReason: result.scoringReason,
            isRecommended: result.isRecommended,
            angleRecommendation: result.angleRecommendation,
            recommendationReason: result.recommendationReason,
          },
        });
      }

      await tx.topic.update({
        where: { id: topic.id },
        data: { status: "scored" },
      });
    });

    const candidates = await prisma.trendCandidate.findMany({
      where: { topicId: topic.id },
      orderBy: { totalScore: "desc" },
    });

    return NextResponse.json({ topicId: topic.id, candidates, ...generationMetadata });
  } catch (error) {
    return NextResponse.json(
      {
        error: "후보 점수 계산 실패",
        generationStatus: "failed",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
      { status: 500 },
    );
  }
}
