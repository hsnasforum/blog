import {
  classifySignalType,
  detectCommunityRisk,
} from "@/lib/community/community-utils";
import type {
  DcinsideListItem,
  DcinsideSignalMeta,
  NormalizedDcinsideSignal,
} from "@/lib/community/collectors/dcinside/dcinside-types";

function sourceTabLabel(sourceTab: DcinsideListItem["sourceTab"]) {
  return sourceTab === "info" ? "정보탭" : "베스트탭";
}

function confidenceFor(item: DcinsideListItem, riskLevel: string) {
  if (riskLevel === "high" || riskLevel === "blocked") return "low";
  if (item.sourceTab === "best" || item.commentCount >= 10 || item.recommendCount >= 10) return "medium";
  return "low";
}

export function normalizeDcinsideSignal(item: DcinsideListItem): NormalizedDcinsideSignal {
  const risk = detectCommunityRisk(item.title);
  const signalType = classifySignalType(item.title);
  const score = Math.max(0, Math.round(item.viewCount * 0.02 + item.commentCount * 2 + item.recommendCount * 3));
  const meta: DcinsideSignalMeta = {
    category: item.category,
    authorMasked: item.authorMasked,
    createdAtText: item.createdAtText,
    dateParseMode: item.dateParseMode,
    hasImage: item.hasImage,
    sourceTab: item.sourceTab,
    detectedSourceTab: item.detectedSourceTab,
    importedFrom: "manual_html_import",
    riskKeywords: risk.riskKeywords,
  };

  return {
    ...item,
    sourceType: "dcinside",
    sourceName: `DCInside 특이점갤 ${sourceTabLabel(item.sourceTab)}`,
    score,
    reactionCount: item.recommendCount,
    summary: `DCInside 특이점갤 ${sourceTabLabel(item.sourceTab)}에서 확인된 조기 신호: ${item.title}`,
    signalType,
    riskLevel: risk.riskLevel,
    verificationStatus: risk.verificationStatus,
    confidence: confidenceFor(item, risk.riskLevel),
    rawMetaJson: JSON.stringify(meta),
  };
}
