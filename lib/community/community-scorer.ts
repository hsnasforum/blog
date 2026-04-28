import type { CommunitySignal, TrendSignal } from "@prisma/client";

import { daysSince, clamp } from "@/lib/community/community-utils";

type CandidateVerdict = "write_now" | "review_first" | "hold" | "reject";
type ScoreConfidence = "low" | "medium" | "high";

export type CommunityScoreCandidate = {
  id: string;
  keyword: string;
  searchGrowthScore: number | null;
  newsVelocityScore: number | null;
  communityHeatScore: number | null;
  blogFitScore: number | null;
  differentiationScore: number | null;
  lifespanScore: number | null;
  riskPenalty: number | null;
};

export type CommunityHeatScore = {
  recencyScore: number;
  engagementScore: number;
  crossSourceScore: number;
  painPointScore: number;
  blogFitScore: number;
  rumorPenalty: number;
  communityHeatScore: number;
  totalScore: number;
  verdict: CandidateVerdict;
  confidence: ScoreConfidence;
  scoringReason: string;
  recommendationReason: string;
  isRecommended: boolean;
  riskPenalty: number;
};

function sourceKey(signal: CommunitySignal) {
  return `${signal.sourceType}:${signal.sourceName}`;
}

function sourceLabel(sourceType: string) {
  if (sourceType === "manual") return "수동 입력";
  if (sourceType === "dcinside") return "DCInside";
  if (sourceType === "hacker_news") return "Hacker News";
  if (sourceType === "github_issues") return "GitHub Issues";
  if (sourceType === "stackexchange") return "Stack Exchange";
  if (sourceType === "reddit") return "Reddit";
  return sourceType;
}

function computeVerdict(params: {
  totalScore: number;
  sourceCount: number;
  hasNewsOrOfficialConfirmation: boolean;
  rumorCount: number;
  highRiskCount: number;
  blockedCount: number;
}): CandidateVerdict {
  if (params.blockedCount > 0) return "reject";

  if (
    params.totalScore >= 80 &&
    params.sourceCount >= 2 &&
    params.hasNewsOrOfficialConfirmation &&
    params.rumorCount === 0 &&
    params.highRiskCount === 0
  ) {
    return "write_now";
  }

  if (params.totalScore >= 65) return "review_first";
  if (params.totalScore >= 50) return "hold";
  return "reject";
}

function confidenceFromSignals(sourceCount: number, signalCount: number, rumorCount: number): ScoreConfidence {
  if (sourceCount >= 3 && signalCount >= 5 && rumorCount === 0) return "high";
  if (sourceCount >= 2 && signalCount >= 3) return "medium";
  return "low";
}

export function scoreCommunityHeat(
  candidate: CommunityScoreCandidate,
  communitySignals: CommunitySignal[],
  trendSignals: TrendSignal[] = [],
): CommunityHeatScore | null {
  const usableSignals = communitySignals.filter((signal) => signal.riskLevel !== "blocked");
  if (usableSignals.length === 0) return null;

  const sourceCount = new Set(usableSignals.map(sourceKey)).size;
  const sourceTypes = new Set(usableSignals.map((signal) => signal.sourceType));
  const recentSignals = usableSignals.filter((signal) => daysSince(signal.publishedAt ?? signal.collectedAt) <= 30);
  const veryRecentSignals = usableSignals.filter((signal) => daysSince(signal.publishedAt ?? signal.collectedAt) <= 7);
  const engagement = usableSignals.reduce(
    (sum, signal) =>
      sum +
      Math.max(0, signal.score) +
      Math.max(0, signal.viewCount) * 0.05 +
      Math.max(0, signal.commentCount) * 2 +
      Math.max(0, signal.reactionCount) +
      Math.max(0, signal.recommendCount) * 1.5,
    0,
  );
  const painTypes = new Set(["common_complaint", "beginner_confusion", "operational_issue", "bug_report"]);
  const painSignals = usableSignals.filter((signal) => painTypes.has(signal.signalType));
  const rumorSignals = usableSignals.filter((signal) => signal.signalType === "rumor");
  const highRiskSignals = usableSignals.filter((signal) => signal.riskLevel === "high");
  const blockedSignals = communitySignals.filter((signal) => signal.riskLevel === "blocked");
  const officialSignals = usableSignals.filter((signal) => signal.verificationStatus === "official_confirmed");
  const hasOfficialConfirmation = officialSignals.length > 0;
  const recencyScore = clamp(veryRecentSignals.length * 4 + recentSignals.length * 2, 0, 15);
  const engagementScore = clamp(Math.round(Math.log10(engagement + 1) * 8), 0, 20);
  const crossSourceScore = clamp(sourceCount * 5, 0, 15);
  const painPointScore = clamp(painSignals.length * 4, 0, 15);
  const blogFitScore = clamp(candidate.blogFitScore ?? 8, 0, 15);
  const rumorPenalty = clamp(-(rumorSignals.length * 12 + highRiskSignals.length * 8 + blockedSignals.length * 30), -30, 0);
  const communityHeatScore = clamp(
    Math.round((recencyScore + engagementScore + crossSourceScore + painPointScore) * 0.31),
    0,
    20,
  );
  const searchGrowthScore = clamp(candidate.searchGrowthScore ?? 0, 0, 30);
  const newsVelocityScore = clamp(candidate.newsVelocityScore ?? 0, 0, 20);
  const differentiationScore = clamp(candidate.differentiationScore ?? 5, 0, 10);
  const lifespanScore = clamp(candidate.lifespanScore ?? 3, 0, 5);
  const riskPenalty = clamp((candidate.riskPenalty ?? 0) + rumorPenalty, -30, 0);
  const uncappedTotal =
    searchGrowthScore +
    newsVelocityScore +
    communityHeatScore +
    blogFitScore +
    differentiationScore +
    lifespanScore +
    riskPenalty;
  const totalScore = clamp(uncappedTotal, 0, 100);
  const verdict = computeVerdict({
    totalScore,
    sourceCount,
    hasNewsOrOfficialConfirmation: hasOfficialConfirmation,
    rumorCount: rumorSignals.length,
    highRiskCount: highRiskSignals.length,
    blockedCount: blockedSignals.length,
  });
  const confidence = confidenceFromSignals(sourceCount, usableSignals.length, rumorSignals.length + highRiskSignals.length);
  const sourcesText = Array.from(sourceTypes).map(sourceLabel).join(", ");
  const signalTypesText = Array.from(new Set(usableSignals.map((signal) => signal.signalType))).join(", ");
  const writeNowLimit =
    verdict !== "write_now" && totalScore >= 80
      ? " 단일 출처이거나 뉴스/공식 확인이 부족해 write_now를 제한했습니다."
      : "";
  const rumorText = rumorSignals.length > 0 ? ` 루머성 신호 ${rumorSignals.length}개로 riskPenalty를 적용했습니다.` : "";
  const riskText = highRiskSignals.length > 0 ? ` high risk 신호 ${highRiskSignals.length}개로 write_now를 제한했습니다.` : "";
  const scoringReason = `커뮤니티 반응 기반 조기 신호 점수입니다. 출처 ${sourceCount}개(${sourcesText}), signalType=${signalTypesText}. recency=${recencyScore}, engagement=${engagementScore}, crossSource=${crossSourceScore}, painPoint=${painPointScore}.${writeNowLimit}${rumorText}${riskText}`;
  const recommendationReason =
    verdict === "write_now"
      ? "바로 작성 추천: 커뮤니티 2곳 이상 반복 신호와 공식/뉴스 확인이 함께 있습니다."
      : verdict === "review_first"
        ? "검토 후 작성 추천: 커뮤니티 반응은 있으나 출처/공식 확인/루머 여부를 사람 검토로 확인해야 합니다."
        : verdict === "hold"
          ? "보류: 커뮤니티 신호가 약하거나 반복성이 부족합니다."
          : "제외 권장: 커뮤니티 신호 대비 리스크가 큽니다.";

  return {
    recencyScore,
    engagementScore,
    crossSourceScore,
    painPointScore,
    blogFitScore,
    rumorPenalty,
    communityHeatScore,
    totalScore,
    verdict,
    confidence,
    scoringReason,
    recommendationReason,
    isRecommended: verdict === "write_now" || verdict === "review_first",
    riskPenalty,
  };
}
