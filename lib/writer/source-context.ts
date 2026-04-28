import { parseTrendCandidateSourceMeta } from "@/lib/community/source-meta";

export type WriterOfficialSourceContext = {
  sourceType: string;
  title: string;
  url: string;
  note: string | null;
  verificationStatus: string;
};

export type WriterReinforcementSignalContext = {
  sourceType: string;
  sourceName: string;
  title: string;
  url: string;
  signalType: string;
  verificationStatus: string;
  confidence: string;
  commentCount: number;
  reactionCount: number;
  repository: string | null;
  updatedAt: string | null;
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
  reinforcementSignals: WriterReinforcementSignalContext[];
  verificationStatus: string;
  riskLevel: string | null;
  writingGuidance: string;
};

function parseSignalMeta(raw: string | null) {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

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
    sourceType?: string;
    sourceName?: string;
    title?: string;
    url?: string;
    signalType?: string;
    riskLevel: string;
    verificationStatus: string;
    confidence?: string;
    commentCount?: number;
    reactionCount?: number;
    rawMetaJson?: string | null;
  }>;
}): WriterSourceContext | null {
  const sourceMeta = parseTrendCandidateSourceMeta(candidate.sourceMetaJson);
  const officialSources = candidate.officialSources ?? [];
  const reinforcementSignals = (candidate.communitySignals ?? [])
    .filter((signal) => signal.sourceType === "github_issues")
    .slice(0, 3)
    .map((signal) => {
      const meta = parseSignalMeta(signal.rawMetaJson ?? null);
      return {
        sourceType: signal.sourceType ?? "github_issues",
        sourceName: signal.sourceName ?? "GitHub Issues",
        title: signal.title ?? "",
        url: signal.url ?? "",
        signalType: signal.signalType ?? "community_reaction",
        verificationStatus: signal.verificationStatus,
        confidence: signal.confidence ?? "medium",
        commentCount: signal.commentCount ?? 0,
        reactionCount: signal.reactionCount ?? 0,
        repository: meta.repository ? String(meta.repository) : null,
        updatedAt: meta.updatedAt ? String(meta.updatedAt) : null,
      };
    });
  const verificationStatus =
    officialSources.find((source) => source.verificationStatus === "rejected_as_rumor")?.verificationStatus ??
    officialSources.find((source) => source.verificationStatus === "contradicted")?.verificationStatus ??
    officialSources.find((source) => source.verificationStatus === "official_confirmed")?.verificationStatus ??
    officialSources.find((source) => source.verificationStatus === "needs_manual_review")?.verificationStatus ??
    sourceMeta?.verificationStatus ??
    candidate.communitySignals?.[0]?.verificationStatus ??
    "community_only";
  const riskLevel = sourceMeta?.riskLevel ?? candidate.communitySignals?.[0]?.riskLevel ?? null;

  if (!sourceMeta && officialSources.length === 0 && reinforcementSignals.length === 0) return null;

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
    reinforcementSignals,
    verificationStatus,
    riskLevel,
    writingGuidance: getSourceWritingGuidance(verificationStatus, reinforcementSignals),
  };
}

function getSourceWritingGuidance(
  verificationStatus: string,
  reinforcementSignals: WriterReinforcementSignalContext[] = [],
) {
  const reinforcementGuidance =
    reinforcementSignals.length > 0
      ? " GitHub Issues 같은 보강 신호는 공식 확인이 아니라 needs_manual_review 신호로만 다룬다. 필요하면 'GitHub 이슈에서도 유사한 논의가 보인다' 정도로 보수적으로 표현하고, 공식 확인됨이라고 쓰지 않는다."
      : "";

  if (verificationStatus === "official_confirmed") {
    return `공식 출처가 있으면 공식 안내/원문 기준으로 확인된 내용과 커뮤니티 조기 신호를 분리해 설명한다. 과장하거나 발행 결론을 자동화하지 않는다.${reinforcementGuidance}`;
  }

  if (verificationStatus === "contradicted" || verificationStatus === "rejected_as_rumor") {
    return `반박 또는 루머 처리된 후보는 사실처럼 쓰지 않는다. 필요하다면 루머 검증 실패 사례나 확인 절차로만 다룬다.${reinforcementGuidance}`;
  }

  return `커뮤니티 신호만 있으면 '커뮤니티에서 이런 이야기가 나왔다', '공식 확인 필요'처럼 검토형으로 쓴다. 출시, 중단, 가격, 정책을 확정하지 않는다.${reinforcementGuidance}`;
}
