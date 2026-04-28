export const COMMUNITY_SOURCE_META_WARNING =
  "커뮤니티 조기 신호입니다. 공식 확인 전 사실로 단정하지 마세요.";

export type TrendCandidateSourceMeta = {
  sourceType: string;
  sourceName: string;
  sourceTab: string | null;
  signalTitle: string;
  signalUrl: string;
  signalType: string;
  riskLevel: string;
  verificationStatus: string;
};

export function buildTrendCandidateSourceMetaJson(signal: {
  sourceType: string;
  sourceName: string;
  sourceTab: string | null;
  title: string;
  url: string;
  signalType: string;
  riskLevel: string;
  verificationStatus: string;
}) {
  const meta: TrendCandidateSourceMeta = {
    sourceType: signal.sourceType,
    sourceName: signal.sourceName,
    sourceTab: signal.sourceTab,
    signalTitle: signal.title,
    signalUrl: signal.url,
    signalType: signal.signalType,
    riskLevel: signal.riskLevel,
    verificationStatus: signal.verificationStatus,
  };

  return JSON.stringify(meta);
}

export function serializeTrendCandidateSourceMeta(meta: TrendCandidateSourceMeta) {
  return JSON.stringify(meta);
}

export function parseTrendCandidateSourceMeta(raw: string | null): TrendCandidateSourceMeta | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const record = parsed as Record<string, unknown>;
    const meta = {
      sourceType: String(record.sourceType ?? ""),
      sourceName: String(record.sourceName ?? ""),
      sourceTab: record.sourceTab === null || record.sourceTab === undefined ? null : String(record.sourceTab),
      signalTitle: String(record.signalTitle ?? ""),
      signalUrl: String(record.signalUrl ?? ""),
      signalType: String(record.signalType ?? ""),
      riskLevel: String(record.riskLevel ?? ""),
      verificationStatus: String(record.verificationStatus ?? ""),
    };

    if (!meta.sourceName && !meta.signalTitle && !meta.signalUrl) return null;

    return meta;
  } catch {
    return null;
  }
}
