import type {
  CommunityConfidenceLevel,
  CommunityRiskLevel,
  CommunitySignalType,
  CommunityVerificationStatus,
} from "@/lib/community/community-types";

export const dcinsideSourceTabs = ["info", "best"] as const;
export type DcinsideSourceTab = (typeof dcinsideSourceTabs)[number];
export const dcinsideSkipReasons = [
  "empty_row",
  "notice_or_ad",
  "missing_title",
  "missing_url",
  "missing_external_id",
  "duplicate",
] as const;
export type DcinsideSkipReason = (typeof dcinsideSkipReasons)[number];
export type DcinsideSkipReasonSummary = Record<DcinsideSkipReason, number>;

export type DcinsideListItem = {
  externalId: string;
  title: string;
  url: string;
  canonicalUrl: string;
  detectedSourceTab: DcinsideSourceTab | null;
  category: string | null;
  authorMasked: string | null;
  createdAtText: string | null;
  publishedAt: Date | null;
  dateParseMode: "exact" | "same_day_time" | "current_year_month_day" | "short_year_month_day" | "unparsed";
  viewCount: number;
  commentCount: number;
  recommendCount: number;
  hasImage: boolean;
  sourceTab: DcinsideSourceTab;
};

export type DcinsideSignalMeta = {
  category: string | null;
  authorMasked: string | null;
  createdAtText: string | null;
  dateParseMode: DcinsideListItem["dateParseMode"];
  hasImage: boolean;
  sourceTab: DcinsideSourceTab;
  detectedSourceTab: DcinsideSourceTab | null;
  importedFrom: "manual_html_import";
  riskKeywords: string[];
};

export type NormalizedDcinsideSignal = DcinsideListItem & {
  sourceType: "dcinside";
  sourceName: string;
  score: number;
  reactionCount: number;
  summary: string;
  signalType: CommunitySignalType;
  riskLevel: CommunityRiskLevel;
  verificationStatus: CommunityVerificationStatus;
  confidence: CommunityConfidenceLevel;
  rawMetaJson: string;
};

export type DcinsideParseResult = {
  items: DcinsideListItem[];
  skippedCount: number;
  skipReasons: DcinsideSkipReasonSummary;
  parserVersion: string;
  detectedSourceTab: DcinsideSourceTab | null;
  sourceTabMismatch: boolean;
  warnings: string[];
};
