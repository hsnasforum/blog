import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { CommunityCollector } from "@/lib/community/community-collector";
import { GitHubIssuesCollector } from "@/lib/community/collectors/github-issues-collector";
import { HackerNewsCollector } from "@/lib/community/collectors/hacker-news-collector";
import { RedditCollector } from "@/lib/community/collectors/reddit-collector";
import { StackExchangeCollector } from "@/lib/community/collectors/stackexchange-collector";
import { scoreCommunityHeat } from "@/lib/community/community-scorer";
import type { CommunitySignalInput } from "@/lib/community/community-types";
import { isSafeHttpUrl } from "@/lib/community/community-utils";
import { MockCommunityCollector } from "@/lib/community/mock-community-collector";

function summarize(text: string, max = 500) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 3)}...`;
}

function isMockMode() {
  return process.env.COMMUNITY_COLLECTOR_MODE === "mock";
}

function getCollectors(): CommunityCollector[] {
  if (isMockMode()) {
    return [
      new MockCommunityCollector("hacker_news", "Hacker News"),
      new MockCommunityCollector("github_issues", "GitHub Issues"),
    ];
  }

  return [
    new HackerNewsCollector(),
    new GitHubIssuesCollector(),
    new StackExchangeCollector(),
    new RedditCollector(),
  ];
}

function createSignalData(signal: CommunitySignalInput): Prisma.CommunitySignalCreateManyInput {
  return {
    topicId: signal.topicId ?? null,
    candidateId: signal.candidateId ?? null,
    sourceType: signal.sourceType,
    sourceName: signal.sourceName,
    sourceTab: signal.sourceTab ?? null,
    externalId: signal.externalId ?? null,
    canonicalUrl: signal.canonicalUrl ?? null,
    title: signal.title,
    url: signal.url,
    publishedAt: signal.publishedAt ?? null,
    observedAt: signal.observedAt ?? null,
    score: Math.max(0, Math.round(signal.score ?? 0)),
    viewCount: Math.max(0, Math.round(signal.viewCount ?? 0)),
    commentCount: Math.max(0, Math.round(signal.commentCount ?? 0)),
    reactionCount: Math.max(0, Math.round(signal.reactionCount ?? 0)),
    recommendCount: Math.max(0, Math.round(signal.recommendCount ?? 0)),
    summary: signal.summary,
    signalType: signal.signalType,
    riskLevel: signal.riskLevel ?? "medium",
    verificationStatus: signal.verificationStatus ?? "community_only",
    confidence: signal.confidence ?? "low",
    rawMetaJson: signal.rawMetaJson ?? null,
    linksJson: signal.linksJson ?? null,
    importMethod: signal.importMethod ?? null,
    importBatchId: signal.importBatchId ?? null,
    status: signal.status ?? "success",
    errorMessage: signal.errorMessage ?? null,
  };
}

export async function rescoreCommunityCandidate(candidateId: string) {
  const candidate = await prisma.trendCandidate.findUnique({
    where: { id: candidateId },
    include: {
      communitySignals: true,
      trendSignals: true,
    },
  });

  if (!candidate) return null;

  const score = scoreCommunityHeat(candidate, candidate.communitySignals, candidate.trendSignals);
  if (!score) return null;

  await prisma.trendCandidate.update({
    where: { id: candidate.id },
    data: {
      scoringBasis: "external_data",
      communityHeatScore: score.communityHeatScore,
      blogFitScore: score.blogFitScore,
      riskPenalty: score.riskPenalty,
      totalScore: score.totalScore,
      verdict: score.verdict,
      confidence: score.confidence,
      scoringVersion: "v2",
      scoringReason: score.scoringReason,
      recommendationReason: score.recommendationReason,
      isRecommended: score.isRecommended,
    },
  });

  return score;
}

export async function addManualCommunitySignal(input: CommunitySignalInput, topicId?: string) {
  if (!input.candidateId) {
    return {
      ok: false as const,
      status: 400,
      error: "candidateId는 필수입니다.",
    };
  }

  if (!isSafeHttpUrl(input.url)) {
    return {
      ok: false as const,
      status: 400,
      error: "url은 http 또는 https URL이어야 합니다.",
    };
  }

  const candidate = await prisma.trendCandidate.findUnique({
    where: { id: input.candidateId },
  });

  if (!candidate) {
    return {
      ok: false as const,
      status: 404,
      error: "후보를 찾을 수 없습니다.",
    };
  }

  if (topicId && candidate.topicId !== topicId) {
    return {
      ok: false as const,
      status: 400,
      error: "해당 토픽의 후보에만 커뮤니티 소스를 추가할 수 있습니다.",
    };
  }

  const signal = await prisma.communitySignal.create({
    data: createSignalData({ ...input, topicId: candidate.topicId, candidateId: candidate.id, sourceType: "manual" }),
  });
  const score = await rescoreCommunityCandidate(candidate.id);

  await prisma.generationLog.create({
    data: {
      action: "addManualCommunitySignal",
      provider: "manual",
      model: "manual-community-source",
      inputSummary: `candidate=${candidate.keyword}, source=${input.sourceName}`,
      outputSummary: `signalType=${input.signalType}, scoreUpdated=${Boolean(score)}`,
      status: "success",
      generationStatus: "success",
    },
  });

  return {
    ok: true as const,
    signal,
    score,
  };
}

export async function collectCommunitySignalsForTopic(topicId: string) {
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
      error: "커뮤니티 신호를 수집할 후보가 없습니다. 먼저 후보를 생성해 주세요.",
    };
  }

  const collectors = getCollectors();
  const signals: CommunitySignalInput[] = [];
  const warnings: string[] = [];

  for (const candidate of topic.trendCandidates) {
    for (const collector of collectors) {
      const result = await collector.collect({
        id: candidate.id,
        keyword: candidate.keyword,
      });
      signals.push(
        ...result.signals.map((signal) => ({
          ...signal,
          topicId,
          candidateId: candidate.id,
        })),
      );
      warnings.push(...result.warnings.map((warning) => `${collector.sourceType}: ${warning}`));
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.communitySignal.deleteMany({
      where: {
        candidateId: { in: topic.trendCandidates.map((candidate) => candidate.id) },
        sourceType: { in: ["hacker_news", "github_issues", "stackexchange", "reddit"] },
      },
    });

    if (signals.length > 0) {
      await tx.communitySignal.createMany({
        data: signals.map(createSignalData),
      });
    }
  });

  const candidates = await prisma.trendCandidate.findMany({
    where: { topicId },
    include: {
      communitySignals: true,
      trendSignals: true,
    },
  });
  const updates = [];

  for (const candidate of candidates) {
    const score = scoreCommunityHeat(candidate, candidate.communitySignals, candidate.trendSignals);
    if (!score) continue;
    updates.push({ candidate, score });
    await prisma.trendCandidate.update({
      where: { id: candidate.id },
      data: {
        scoringBasis: "external_data",
        communityHeatScore: score.communityHeatScore,
        blogFitScore: score.blogFitScore,
        riskPenalty: score.riskPenalty,
        totalScore: score.totalScore,
        verdict: score.verdict,
        confidence: score.confidence,
        scoringVersion: "v2",
        scoringReason: score.scoringReason,
        recommendationReason: score.recommendationReason,
        isRecommended: score.isRecommended,
      },
    });
  }

  const status = signals.length > 0 ? "success" : "failed";
  await prisma.generationLog.create({
    data: {
      action: "collectCommunitySignals",
      provider: isMockMode() ? "mock" : "public-community-apis",
      model: isMockMode() ? "mock-community-radar" : "hn-github-stackexchange-reddit",
      inputSummary: `topic=${topic.rawTopic}, candidates=${topic.trendCandidates.length}`,
      outputSummary: `signals=${signals.length}, scoreUpdates=${updates.length}, warnings=${warnings.length}`,
      status,
      generationStatus: status,
      errorMessage: warnings.length > 0 ? summarize(warnings.join(" / ")) : null,
    },
  });

  const updatedCandidates = await prisma.trendCandidate.findMany({
    where: { topicId },
    include: {
      communitySignals: {
        orderBy: [{ collectedAt: "desc" }],
      },
      trendSignals: true,
    },
    orderBy: [{ totalScore: "desc" }, { createdAt: "asc" }],
  });

  return {
    ok: true as const,
    collectionStatus: signals.length > 0 ? (warnings.length > 0 ? "partial" : "success") : "failed",
    topicId,
    candidates: updatedCandidates,
    signalCount: signals.length,
    warnings,
    warning:
      signals.length === 0
        ? "커뮤니티 신호를 수집하지 못했습니다. 기존 추정 점수를 유지했습니다."
        : warnings.length > 0
          ? "일부 커뮤니티 수집기가 실패했습니다. 성공한 신호만 반영했습니다."
          : null,
  };
}
