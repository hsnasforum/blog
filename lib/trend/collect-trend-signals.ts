import type { Prisma, TrendCandidate } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { TrendCollectorResult } from "@/lib/trend/collectors/base-trend-collector";
import { MockTrendCollector } from "@/lib/trend/collectors/mock-trend-collector";
import { NaverBlogCollector } from "@/lib/trend/collectors/naver-blog-collector";
import { NaverDataLabCollector } from "@/lib/trend/collectors/naver-datalab-collector";
import { NaverNewsCollector } from "@/lib/trend/collectors/naver-news-collector";
import {
  getNaverCredentials,
  isMockTrendCollectorMode,
  isTrendCollectionConfigured,
} from "@/lib/trend/naver-config";
import { scoreCandidateWithTrendSignals } from "@/lib/trend/trend-signal-scorer";

type CollectionStatus = "success" | "partial" | "failed";

type CandidateWithScores = Pick<
  TrendCandidate,
  | "id"
  | "keyword"
  | "searchGrowthScore"
  | "newsVelocityScore"
  | "communityHeatScore"
  | "blogFitScore"
  | "differentiationScore"
  | "lifespanScore"
  | "riskPenalty"
>;

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function summarize(text: string, max = 500) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 3)}...`;
}

function createSignalData(candidateId: string, signal: TrendCollectorResult): Prisma.TrendSignalCreateManyInput {
  return {
    candidateId,
    source: signal.source,
    keyword: signal.keyword,
    score: Math.round(signal.score),
    rawSummary: signal.rawSummary,
    linksJson: JSON.stringify(signal.links.slice(0, 3)),
    status: signal.status,
    errorMessage: signal.errorMessage ? summarize(signal.errorMessage) : null,
  };
}

async function collectWithMock(candidates: CandidateWithScores[]) {
  const collectors = [
    new MockTrendCollector("naver_datalab"),
    new MockTrendCollector("naver_news"),
    new MockTrendCollector("naver_blog"),
  ];
  const pairs: Array<{ candidate: CandidateWithScores; signal: TrendCollectorResult }> = [];

  for (const candidate of candidates) {
    for (const collector of collectors) {
      pairs.push({ candidate, signal: await collector.collect(candidate.keyword) });
    }
  }

  return pairs;
}

async function collectWithNaver(candidates: CandidateWithScores[]) {
  const credentials = getNaverCredentials();

  if (!credentials) {
    throw new Error("NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET이 필요합니다.");
  }

  const datalabCollector = new NaverDataLabCollector(credentials);
  const newsCollector = new NaverNewsCollector(credentials);
  const blogCollector = new NaverBlogCollector(credentials);
  const pairs: Array<{ candidate: CandidateWithScores; signal: TrendCollectorResult }> = [];
  const byKeyword = new Map(candidates.map((candidate) => [candidate.keyword, candidate]));

  for (const keywordBatch of chunk(candidates.map((candidate) => candidate.keyword), 5)) {
    const datalabResults = await datalabCollector.collectMany(keywordBatch);
    for (const signal of datalabResults) {
      const candidate = byKeyword.get(signal.keyword);
      if (candidate) pairs.push({ candidate, signal });
    }
  }

  for (const candidate of candidates) {
    pairs.push({ candidate, signal: await newsCollector.collect(candidate.keyword) });
    pairs.push({ candidate, signal: await blogCollector.collect(candidate.keyword) });
  }

  return pairs;
}

function getCollectionStatus(signals: TrendCollectorResult[]): CollectionStatus {
  const successCount = signals.filter((signal) => signal.status === "success").length;

  if (successCount === 0) return "failed";
  if (successCount < signals.length) return "partial";
  return "success";
}

export async function collectTrendSignalsForTopic(topicId: string) {
  if (!isTrendCollectionConfigured()) {
    return {
      ok: false as const,
      status: 400,
      error: "NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET이 없어 외부 트렌드 수집을 실행할 수 없습니다.",
    };
  }

  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: {
      trendCandidates: {
        orderBy: [{ totalScore: "desc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!topic) {
    return {
      ok: false as const,
      status: 404,
      error: "토픽을 찾을 수 없습니다.",
    };
  }

  if (topic.trendCandidates.length === 0) {
    return {
      ok: false as const,
      status: 400,
      error: "외부 신호를 수집할 후보가 없습니다. 먼저 후보를 생성해 주세요.",
    };
  }

  const mode = isMockTrendCollectorMode() ? "mock" : "naver";
  const candidates = topic.trendCandidates.map((candidate) => ({
    id: candidate.id,
    keyword: candidate.keyword,
    searchGrowthScore: candidate.searchGrowthScore,
    newsVelocityScore: candidate.newsVelocityScore,
    communityHeatScore: candidate.communityHeatScore,
    blogFitScore: candidate.blogFitScore,
    differentiationScore: candidate.differentiationScore,
    lifespanScore: candidate.lifespanScore,
    riskPenalty: candidate.riskPenalty,
  }));
  const pairs = mode === "mock" ? await collectWithMock(candidates) : await collectWithNaver(candidates);
  const allSignals = pairs.map((pair) => pair.signal);
  const collectionStatus = getCollectionStatus(allSignals);
  const candidateIds = candidates.map((candidate) => candidate.id);
  const signalsByCandidate = new Map<string, TrendCollectorResult[]>();

  for (const pair of pairs) {
    const current = signalsByCandidate.get(pair.candidate.id) ?? [];
    current.push(pair.signal);
    signalsByCandidate.set(pair.candidate.id, current);
  }

  const scoreUpdates = candidates
    .map((candidate) => scoreCandidateWithTrendSignals(candidate, signalsByCandidate.get(candidate.id) ?? []))
    .filter((result) => result !== null);

  await prisma.$transaction(async (tx) => {
    await tx.trendSignal.deleteMany({
      where: { candidateId: { in: candidateIds } },
    });

    if (pairs.length > 0) {
      await tx.trendSignal.createMany({
        data: pairs.map((pair) => createSignalData(pair.candidate.id, pair.signal)),
      });
    }

    for (const update of scoreUpdates) {
      await tx.trendCandidate.update({
        where: { id: update.id },
        data: {
          scoringBasis: update.scoringBasis,
          searchGrowthScore: update.searchGrowthScore,
          newsVelocityScore: update.newsVelocityScore,
          communityHeatScore: update.communityHeatScore,
          blogFitScore: update.blogFitScore,
          differentiationScore: update.differentiationScore,
          lifespanScore: update.lifespanScore,
          riskPenalty: update.riskPenalty,
          totalScore: update.totalScore,
          verdict: update.verdict,
          confidence: update.confidence,
          scoringVersion: update.scoringVersion,
          scoringReason: update.scoringReason,
          recommendationReason: update.recommendationReason,
          isRecommended: update.isRecommended,
        },
      });
    }

    await tx.topic.update({
      where: { id: topic.id },
      data: {
        status: collectionStatus === "failed" ? "external_trends_failed" : "external_trends_collected",
      },
    });

    await tx.generationLog.create({
      data: {
        action: "collectTrendSignals",
        provider: mode === "mock" ? "mock" : "naver",
        model: mode === "mock" ? "mock-trend-collector" : "naver-openapi",
        inputSummary: `topic=${topic.rawTopic}, candidates=${candidates.length}`,
        outputSummary: `status=${collectionStatus}, signals=${allSignals.length}, externalUpdates=${scoreUpdates.length}`,
        status: collectionStatus === "failed" ? "failed" : "success",
        generationStatus: collectionStatus === "failed" ? "failed" : "success",
        errorMessage:
          collectionStatus === "failed"
            ? summarize(allSignals.map((signal) => signal.errorMessage).filter(Boolean).join(" / "))
            : null,
      },
    });
  });

  const updatedCandidates = await prisma.trendCandidate.findMany({
    where: { topicId },
    include: {
      trendSignals: {
        orderBy: [{ source: "asc" }, { collectedAt: "desc" }],
      },
    },
    orderBy: [{ totalScore: "desc" }, { createdAt: "asc" }],
  });

  return {
    ok: true as const,
    collectionStatus,
    mode,
    topicId,
    signals: allSignals,
    candidates: updatedCandidates,
    warning:
      collectionStatus === "failed"
        ? "외부 데이터 수집에 실패했습니다. 기존 추정 점수를 유지했습니다."
        : collectionStatus === "partial"
          ? "일부 외부 데이터 수집에 실패했습니다. 성공한 소스만 점수에 반영했습니다."
          : null,
  };
}
