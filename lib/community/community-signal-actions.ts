import { prisma } from "@/lib/prisma";
import { rescoreCommunityCandidate } from "@/lib/community/collect-community-signals";
import { buildTrendCandidateSourceMetaJson } from "@/lib/community/source-meta";

function buildRationale(signal: {
  sourceName: string;
  sourceTab: string | null;
  url: string;
  riskLevel: string;
  verificationStatus: string;
}) {
  return [
    `${signal.sourceName}${signal.sourceTab ? ` ${signal.sourceTab}` : ""}에서 확인한 커뮤니티 조기 신호입니다.`,
    `원문 링크: ${signal.url}`,
    `riskLevel=${signal.riskLevel}, verificationStatus=${signal.verificationStatus}`,
    "공식 확인 전에는 write_now로 취급하지 않습니다.",
  ].join("\n");
}

function scoreFromSignal(signal: { riskLevel: string; verificationStatus: string; score: number }) {
  if (signal.riskLevel === "blocked") {
    return {
      totalScore: 0,
      verdict: "reject",
      communityHeatScore: 0,
      riskPenalty: -30,
      confidence: "low",
    };
  }

  if (signal.riskLevel === "high") {
    return {
      totalScore: 55,
      verdict: "hold",
      communityHeatScore: 12,
      riskPenalty: -20,
      confidence: "low",
    };
  }

  const baseScore = signal.verificationStatus === "official_confirmed" ? 72 : 65;
  return {
    totalScore: Math.min(79, baseScore + Math.min(6, Math.round(signal.score / 20))),
    verdict: "review_first",
    communityHeatScore: Math.min(20, 10 + Math.round(signal.score / 15)),
    riskPenalty: signal.riskLevel === "medium" ? -5 : 0,
    confidence: signal.verificationStatus === "official_confirmed" ? "medium" : "low",
  };
}

export async function createCandidateFromCommunitySignal(topicId: string, signalId: string) {
  const signal = await prisma.communitySignal.findUnique({ where: { id: signalId } });

  if (!signal || signal.topicId !== topicId) {
    return {
      ok: false as const,
      status: 404,
      error: "커뮤니티 신호를 찾을 수 없습니다.",
    };
  }

  if (signal.riskLevel === "blocked") {
    return {
      ok: false as const,
      status: 400,
      error: "blocked 신호는 글감 후보 생성에 사용할 수 없습니다.",
    };
  }

  const score = scoreFromSignal(signal);
  const candidate = await prisma.trendCandidate.create({
    data: {
      topicId,
      keyword: signal.title,
      rationale: buildRationale(signal),
      angleRecommendation:
        "커뮤니티 조기 신호를 사실로 단정하지 않고, 사용자 불편/관심 포인트와 공식 확인 필요 항목을 분리해 검토합니다.",
      titleCandidates: JSON.stringify([
        signal.title,
        `${signal.title} 확인해야 할 점`,
        `${signal.title} 커뮤니티 반응 정리`,
      ]),
      scoringBasis: signal.verificationStatus === "official_confirmed" ? "community_signal" : "community_unverified",
      searchGrowthScore: 0,
      newsVelocityScore: 0,
      communityHeatScore: score.communityHeatScore,
      blogFitScore: 12,
      differentiationScore: 8,
      lifespanScore: 3,
      riskPenalty: score.riskPenalty,
      totalScore: score.totalScore,
      verdict: score.verdict,
      confidence: score.confidence,
      scoringVersion: "v2",
      sourceMetaJson: buildTrendCandidateSourceMetaJson(signal),
      scoringReason: `CommunitySignal 기반 후보입니다. verificationStatus=${signal.verificationStatus}, riskLevel=${signal.riskLevel}. 공식 확인 전 write_now는 제한합니다.`,
      recommendationReason:
        score.verdict === "review_first"
          ? "검토 후 작성 추천: 커뮤니티 조기 신호이므로 공식 확인과 수동 검토가 필요합니다."
          : "보류: 루머/미확인 가능성이 있어 공식 확인 전 작성 우선순위를 낮춥니다.",
      isRecommended: score.verdict === "review_first",
    },
  });

  await prisma.communitySignal.update({
    where: { id: signal.id },
    data: { candidateId: candidate.id },
  });

  await prisma.generationLog.create({
    data: {
      action: "createCandidateFromCommunitySignal",
      provider: "manual",
      model: "community-signal",
      inputSummary: `signal=${signal.id}, topic=${topicId}`,
      outputSummary: `candidate=${candidate.id}, verdict=${candidate.verdict}`,
      status: "success",
      generationStatus: "success",
    },
  });

  return {
    ok: true as const,
    candidate,
  };
}

export async function connectCommunitySignalToCandidate(topicId: string, signalId: string, candidateId: string) {
  const [signal, candidate] = await Promise.all([
    prisma.communitySignal.findUnique({ where: { id: signalId } }),
    prisma.trendCandidate.findUnique({ where: { id: candidateId } }),
  ]);

  if (!signal || signal.topicId !== topicId) {
    return {
      ok: false as const,
      status: 404,
      error: "커뮤니티 신호를 찾을 수 없습니다.",
    };
  }

  if (!candidate || candidate.topicId !== topicId) {
    return {
      ok: false as const,
      status: 400,
      error: "해당 토픽의 후보에만 연결할 수 있습니다.",
    };
  }

  const updated = await prisma.communitySignal.update({
    where: { id: signal.id },
    data: {
      candidateId: candidate.id,
      topicId,
    },
  });
  const score = await rescoreCommunityCandidate(candidate.id);

  await prisma.generationLog.create({
    data: {
      action: "connectCommunitySignalToCandidate",
      provider: "manual",
      model: "community-signal",
      inputSummary: `signal=${signal.id}, candidate=${candidate.id}`,
      outputSummary: `scoreUpdated=${Boolean(score)}`,
      status: "success",
      generationStatus: "success",
    },
  });

  return {
    ok: true as const,
    signal: updated,
    score,
  };
}
