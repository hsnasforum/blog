import { prisma } from "@/lib/prisma";
import {
  parseTrendCandidateSourceMeta,
  serializeTrendCandidateSourceMeta,
} from "@/lib/community/source-meta";
import { isSafeHttpUrl } from "@/lib/community/community-utils";
import type {
  OfficialSourceType,
  OfficialVerificationStatus,
} from "@/lib/official-source/official-source-types";

type AddOfficialSourceInput = {
  topicId: string;
  candidateId: string;
  communitySignalId?: string | null;
  sourceType: OfficialSourceType;
  title: string;
  url: string;
  note?: string | null;
  verificationStatus: OfficialVerificationStatus;
};

function candidateRiskLevel(candidate: { sourceMetaJson: string | null }, signals: Array<{ riskLevel: string }>) {
  const sourceMeta = parseTrendCandidateSourceMeta(candidate.sourceMetaJson);
  if (sourceMeta?.riskLevel) return sourceMeta.riskLevel;
  if (signals.some((signal) => signal.riskLevel === "blocked")) return "blocked";
  if (signals.some((signal) => signal.riskLevel === "high")) return "high";
  if (signals.some((signal) => signal.riskLevel === "medium")) return "medium";
  return "low";
}

function highestVerificationStatus(sources: Array<{ verificationStatus: string }>, fallback: string) {
  if (sources.some((source) => source.verificationStatus === "rejected_as_rumor")) return "rejected_as_rumor";
  if (sources.some((source) => source.verificationStatus === "contradicted")) return "contradicted";
  if (sources.some((source) => source.verificationStatus === "official_confirmed")) return "official_confirmed";
  if (sources.some((source) => source.verificationStatus === "needs_manual_review")) return "needs_manual_review";
  return fallback;
}

function updateSourceMetaVerification(sourceMetaJson: string | null, verificationStatus: string) {
  const sourceMeta = parseTrendCandidateSourceMeta(sourceMetaJson);
  if (!sourceMeta) return sourceMetaJson;

  return serializeTrendCandidateSourceMeta({
    ...sourceMeta,
    verificationStatus,
  });
}

function officialScorePatch(params: {
  riskLevel: string;
  verificationStatus: string;
  currentTotalScore: number | null;
}) {
  if (params.verificationStatus === "rejected_as_rumor") {
    return {
      scoringBasis: "community_unverified",
      totalScore: 0,
      verdict: "reject",
      confidence: "low",
      riskPenalty: -30,
      isRecommended: false,
      scoringReason: "공식/신뢰 출처 검증에서 루머로 처리되어 후보를 제외합니다.",
      recommendationReason: "제외 권장: 공식 확인 결과 루머로 처리되었습니다.",
    };
  }

  if (params.verificationStatus === "contradicted") {
    return {
      scoringBasis: "community_unverified",
      totalScore: Math.min(params.currentTotalScore ?? 0, 35),
      verdict: "reject",
      confidence: "low",
      riskPenalty: -30,
      isRecommended: false,
      scoringReason: "공식/신뢰 출처가 커뮤니티 신호와 충돌해 후보를 제외합니다.",
      recommendationReason: "제외 권장: 공식 출처 또는 신뢰 출처가 커뮤니티 신호를 반박합니다.",
    };
  }

  if (params.verificationStatus === "official_confirmed") {
    const canWriteNow = params.riskLevel === "low";
    const totalScore = canWriteNow ? Math.max(params.currentTotalScore ?? 0, 82) : Math.max(params.currentTotalScore ?? 0, 76);

    return {
      scoringBasis: "community_signal",
      totalScore,
      verdict: canWriteNow ? "write_now" : "review_first",
      confidence: canWriteNow ? "high" : "medium",
      riskPenalty: params.riskLevel === "medium" ? -5 : 0,
      isRecommended: true,
      scoringReason: canWriteNow
        ? "공식 출처 확인과 low risk 조건을 만족해 write_now가 가능합니다. 그래도 자동 발행은 하지 않습니다."
        : "공식 출처는 확인됐지만 riskLevel이 medium 이상이므로 사람 검토 후 작성으로 유지합니다.",
      recommendationReason: canWriteNow
        ? "바로 작성 추천: 공식 출처 확인됨. 발행은 reviewReport 확인 후 수동 승인해야 합니다."
        : "검토 후 작성 추천: 공식 출처는 확인됐지만 리스크가 남아 있어 검토가 필요합니다.",
    };
  }

  return {
    scoringBasis: "community_unverified",
    totalScore: Math.min(params.currentTotalScore ?? 65, 79),
    verdict: "review_first",
    confidence: "low",
    riskPenalty: params.riskLevel === "medium" ? -5 : 0,
    isRecommended: true,
    scoringReason: "공식 출처가 아직 수동 검토 상태이므로 community_unverified로 유지합니다.",
    recommendationReason: "검토 후 작성 추천: 공식 확인 상태가 확정되지 않았습니다.",
  };
}

export async function applyOfficialVerificationToCandidate(candidateId: string) {
  const candidate = await prisma.trendCandidate.findUnique({
    where: { id: candidateId },
    include: {
      communitySignals: true,
      officialSources: true,
    },
  });

  if (!candidate) return null;

  const sourceMeta = parseTrendCandidateSourceMeta(candidate.sourceMetaJson);
  const currentVerificationStatus = sourceMeta?.verificationStatus ?? "community_only";
  const verificationStatus = highestVerificationStatus(candidate.officialSources, currentVerificationStatus);
  const riskLevel = candidateRiskLevel(candidate, candidate.communitySignals);
  const scorePatch = officialScorePatch({
    riskLevel,
    verificationStatus,
    currentTotalScore: candidate.totalScore,
  });
  const sourceMetaJson = updateSourceMetaVerification(candidate.sourceMetaJson, verificationStatus);

  const updated = await prisma.trendCandidate.update({
    where: { id: candidate.id },
    data: {
      ...scorePatch,
      scoringVersion: "v2",
      sourceMetaJson,
    },
  });

  await prisma.communitySignal.updateMany({
    where: {
      candidateId: candidate.id,
    },
    data: {
      verificationStatus,
    },
  });

  return {
    candidate: updated,
    verificationStatus,
    riskLevel,
  };
}

export async function addOfficialSource(input: AddOfficialSourceInput) {
  if (!isSafeHttpUrl(input.url)) {
    return {
      ok: false as const,
      status: 400,
      error: "url은 http 또는 https URL이어야 합니다.",
    };
  }

  const candidate = await prisma.trendCandidate.findUnique({
    where: { id: input.candidateId },
    include: {
      topic: true,
    },
  });

  if (!candidate || candidate.topicId !== input.topicId) {
    return {
      ok: false as const,
      status: 404,
      error: "해당 토픽의 후보를 찾을 수 없습니다.",
    };
  }

  if (input.communitySignalId) {
    const signal = await prisma.communitySignal.findUnique({
      where: { id: input.communitySignalId },
    });

    if (!signal || signal.topicId !== input.topicId || signal.candidateId !== input.candidateId) {
      return {
        ok: false as const,
        status: 400,
        error: "해당 후보에 연결된 커뮤니티 신호에만 공식 출처를 연결할 수 있습니다.",
      };
    }
  }

  const source = await prisma.officialSource.create({
    data: {
      candidateId: candidate.id,
      communitySignalId: input.communitySignalId ?? null,
      sourceType: input.sourceType,
      title: input.title.trim(),
      url: input.url.trim(),
      note: input.note?.trim() || null,
      verificationStatus: input.verificationStatus,
    },
  });
  const verification = await applyOfficialVerificationToCandidate(candidate.id);

  await prisma.generationLog.create({
    data: {
      action: "addOfficialSource",
      provider: "manual",
      model: "official-source",
      inputSummary: `candidate=${candidate.id}, sourceType=${source.sourceType}, verificationStatus=${source.verificationStatus}`,
      outputSummary: `source=${source.id}, candidateVerdict=${verification?.candidate.verdict ?? "unknown"}`,
      status: "success",
      generationStatus: "success",
    },
  });

  return {
    ok: true as const,
    source,
    candidate: verification?.candidate ?? candidate,
    verificationStatus: verification?.verificationStatus ?? input.verificationStatus,
  };
}
