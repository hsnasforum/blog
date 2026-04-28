import type { TrendCollectorResult, TrendSignalConfidence } from "@/lib/trend/collectors/base-trend-collector";

type CandidateVerdict = "write_now" | "review_first" | "hold" | "reject";
type ScoreConfidence = "low" | "medium" | "high";

export type TrendScoreCandidate = {
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

export type TrendScoreUpdate = {
  id: string;
  scoringBasis: "external_data";
  searchGrowthScore: number;
  newsVelocityScore: number;
  communityHeatScore: number;
  blogFitScore: number;
  differentiationScore: number;
  lifespanScore: number;
  riskPenalty: number;
  totalScore: number;
  verdict: CandidateVerdict;
  confidence: ScoreConfidence;
  scoringVersion: "v2";
  scoringReason: string;
  recommendationReason: string;
  isRecommended: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeConfidence(confidences: TrendSignalConfidence[]): ScoreConfidence {
  const highCount = confidences.filter((confidence) => confidence === "high").length;
  const mediumCount = confidences.filter((confidence) => confidence === "medium").length;

  if (highCount >= 2) return "high";
  if (highCount + mediumCount >= 2) return "medium";
  return "low";
}

function verdictFromExternalScore(totalScore: number): CandidateVerdict {
  if (totalScore >= 80) return "write_now";
  if (totalScore >= 65) return "review_first";
  if (totalScore >= 50) return "hold";
  return "reject";
}

function recommendationReason(verdict: CandidateVerdict) {
  if (verdict === "write_now") {
    return "바로 작성 추천: 외부 수집 신호가 충분하고 현재 점수가 80점 이상입니다.";
  }

  if (verdict === "review_first") {
    return "검토 후 작성 추천: 외부 신호는 있으나 발행 전 사람 검토가 필요합니다.";
  }

  if (verdict === "hold") {
    return "보류: 외부 신호가 약하거나 블로그 적합도 보완이 필요합니다.";
  }

  return "제외 권장: 외부 신호와 기존 적합도 점수가 모두 낮습니다.";
}

function sourceLabel(source: string) {
  if (source === "naver_datalab") return "Naver DataLab";
  if (source === "naver_news") return "Naver News";
  if (source === "naver_blog") return "Naver Blog";
  return source;
}

export function scoreCandidateWithTrendSignals(
  candidate: TrendScoreCandidate,
  signals: TrendCollectorResult[],
): TrendScoreUpdate | null {
  const successfulSignals = signals.filter((signal) => signal.status === "success");

  if (successfulSignals.length === 0) {
    return null;
  }

  const datalab = successfulSignals.find((signal) => signal.source === "naver_datalab");
  const news = successfulSignals.find((signal) => signal.source === "naver_news");
  const blog = successfulSignals.find((signal) => signal.source === "naver_blog");
  const searchGrowthScore = clamp(Math.round(datalab?.score ?? candidate.searchGrowthScore ?? 0), 0, 30);
  const newsVelocityScore = clamp(Math.round(news?.score ?? candidate.newsVelocityScore ?? 0), 0, 20);
  const communityHeatScore = clamp(Math.round(blog?.score ?? candidate.communityHeatScore ?? 0), 0, 20);
  const blogFitScore = clamp(candidate.blogFitScore ?? 8, 0, 15);
  const differentiationScore = clamp(candidate.differentiationScore ?? 5, 0, 10);
  const lifespanScore = clamp(candidate.lifespanScore ?? 3, 0, 5);
  const riskPenalty = clamp(candidate.riskPenalty ?? 0, -30, 0);
  const totalScore = clamp(
    searchGrowthScore +
      newsVelocityScore +
      communityHeatScore +
      blogFitScore +
      differentiationScore +
      lifespanScore +
      riskPenalty,
    0,
    100,
  );
  const verdict = verdictFromExternalScore(totalScore);
  const confidence = normalizeConfidence(successfulSignals.map((signal) => signal.confidence));
  const usedSources = successfulSignals.map((signal) => `${sourceLabel(signal.source)}(${signal.score})`).join(", ");
  const failedSources = signals
    .filter((signal) => signal.status === "failed")
    .map((signal) => sourceLabel(signal.source));
  const failureText = failedSources.length > 0 ? ` 일부 수집 실패: ${failedSources.join(", ")}.` : "";
  const scoringReason = `외부 데이터 기반 점수입니다. 사용 소스: ${usedSources}. 기존 BlogProfile 적합도/차별화/리스크 점수를 결합했습니다.${failureText} confidence=${confidence}, total=${totalScore}.`;

  return {
    id: candidate.id,
    scoringBasis: "external_data",
    searchGrowthScore,
    newsVelocityScore,
    communityHeatScore,
    blogFitScore,
    differentiationScore,
    lifespanScore,
    riskPenalty,
    totalScore,
    verdict,
    confidence,
    scoringVersion: "v2",
    scoringReason,
    recommendationReason: recommendationReason(verdict),
    isRecommended: verdict === "write_now" || verdict === "review_first",
  };
}
