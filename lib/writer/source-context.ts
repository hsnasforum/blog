import { parseTrendCandidateSourceMeta } from "@/lib/community/source-meta";

export type WriterOfficialSourceContext = {
  sourceType: string;
  title: string;
  url: string;
  note: string | null;
  verificationStatus: string;
};

export type WriterSourceContext = {
  communitySignal: {
    signalTitle: string;
    signalUrl: string;
    signalType: string;
    riskLevel: string;
    verificationStatus: string;
    sourceName: string;
    sourceTab: string | null;
  } | null;
  officialSources: WriterOfficialSourceContext[];
  verificationStatus: string;
  riskLevel: string | null;
  writingGuidance: string;
};

export function buildWriterSourceContext(candidate: {
  sourceMetaJson: string | null;
  officialSources?: Array<{
    sourceType: string;
    title: string;
    url: string;
    note: string | null;
    verificationStatus: string;
  }>;
  communitySignals?: Array<{
    riskLevel: string;
    verificationStatus: string;
  }>;
}): WriterSourceContext | null {
  const sourceMeta = parseTrendCandidateSourceMeta(candidate.sourceMetaJson);
  const officialSources = candidate.officialSources ?? [];
  const verificationStatus =
    officialSources.find((source) => source.verificationStatus === "rejected_as_rumor")?.verificationStatus ??
    officialSources.find((source) => source.verificationStatus === "contradicted")?.verificationStatus ??
    officialSources.find((source) => source.verificationStatus === "official_confirmed")?.verificationStatus ??
    officialSources.find((source) => source.verificationStatus === "needs_manual_review")?.verificationStatus ??
    sourceMeta?.verificationStatus ??
    candidate.communitySignals?.[0]?.verificationStatus ??
    "community_only";
  const riskLevel = sourceMeta?.riskLevel ?? candidate.communitySignals?.[0]?.riskLevel ?? null;

  if (!sourceMeta && officialSources.length === 0) return null;

  return {
    communitySignal: sourceMeta
      ? {
          signalTitle: sourceMeta.signalTitle,
          signalUrl: sourceMeta.signalUrl,
          signalType: sourceMeta.signalType,
          riskLevel: sourceMeta.riskLevel,
          verificationStatus: sourceMeta.verificationStatus,
          sourceName: sourceMeta.sourceName,
          sourceTab: sourceMeta.sourceTab,
        }
      : null,
    officialSources: officialSources.map((source) => ({
      sourceType: source.sourceType,
      title: source.title,
      url: source.url,
      note: source.note,
      verificationStatus: source.verificationStatus,
    })),
    verificationStatus,
    riskLevel,
    writingGuidance: getSourceWritingGuidance(verificationStatus),
  };
}

function getSourceWritingGuidance(verificationStatus: string) {
  if (verificationStatus === "official_confirmed") {
    return "공식 출처가 있으면 공식 안내/원문 기준으로 확인된 내용과 커뮤니티 조기 신호를 분리해 설명한다. 과장하거나 발행 결론을 자동화하지 않는다.";
  }

  if (verificationStatus === "contradicted" || verificationStatus === "rejected_as_rumor") {
    return "반박 또는 루머 처리된 후보는 사실처럼 쓰지 않는다. 필요하다면 루머 검증 실패 사례나 확인 절차로만 다룬다.";
  }

  return "커뮤니티 신호만 있으면 '커뮤니티에서 이런 이야기가 나왔다', '공식 확인 필요'처럼 검토형으로 쓴다. 출시, 중단, 가격, 정책을 확정하지 않는다.";
}
