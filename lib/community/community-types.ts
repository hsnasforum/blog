export const communitySignalTypes = [
  "common_complaint",
  "common_strength",
  "divided_opinion",
  "beginner_confusion",
  "operational_issue",
  "bug_report",
  "documentation_issue",
  "breaking_change",
  "rumor",
  "product_update",
  "early_news",
  "pricing_change",
  "service_change",
  "community_reaction",
] as const;

export type CommunitySignalType = (typeof communitySignalTypes)[number];

export type CommunitySourceType =
  | "manual"
  | "dcinside"
  | "hacker_news"
  | "reddit"
  | "github_issues"
  | "stackexchange";

export const communityRiskLevels = ["low", "medium", "high", "blocked"] as const;
export type CommunityRiskLevel = (typeof communityRiskLevels)[number];

export const communityVerificationStatuses = [
  "community_only",
  "cross_source_matched",
  "official_confirmed",
  "needs_manual_review",
  "contradicted",
  "rejected_as_rumor",
] as const;
export type CommunityVerificationStatus = (typeof communityVerificationStatuses)[number];

export const communityConfidenceLevels = ["low", "medium", "high"] as const;
export type CommunityConfidenceLevel = (typeof communityConfidenceLevels)[number];

export type CommunitySignalInput = {
  topicId?: string | null;
  candidateId?: string | null;
  sourceType: CommunitySourceType;
  sourceName: string;
  sourceTab?: string | null;
  externalId?: string | null;
  canonicalUrl?: string | null;
  title: string;
  url: string;
  publishedAt?: Date | null;
  observedAt?: Date | null;
  score?: number;
  viewCount?: number;
  commentCount?: number;
  reactionCount?: number;
  recommendCount?: number;
  summary: string;
  signalType: CommunitySignalType;
  riskLevel?: CommunityRiskLevel;
  verificationStatus?: CommunityVerificationStatus;
  confidence?: CommunityConfidenceLevel;
  rawMetaJson?: string | null;
  linksJson?: string | null;
  importMethod?: string | null;
  importBatchId?: string | null;
  status?: "success" | "failed";
  errorMessage?: string | null;
};

export type CommunityCollectResult = {
  candidateId: string;
  signals: CommunitySignalInput[];
  warnings: string[];
};

export function isCommunitySignalType(value: string): value is CommunitySignalType {
  return communitySignalTypes.includes(value as CommunitySignalType);
}
