export const officialSourceTypes = [
  "official_doc",
  "official_blog",
  "github_issue",
  "github_release",
  "news",
  "x_original",
  "other",
] as const;

export const officialVerificationStatuses = [
  "needs_manual_review",
  "official_confirmed",
  "contradicted",
  "rejected_as_rumor",
] as const;

export type OfficialSourceType = (typeof officialSourceTypes)[number];
export type OfficialVerificationStatus = (typeof officialVerificationStatuses)[number];

export const officialSourceTypeLabels: Record<OfficialSourceType, string> = {
  official_doc: "공식 문서",
  official_blog: "공식 블로그",
  github_issue: "GitHub Issue",
  github_release: "GitHub Release",
  news: "뉴스",
  x_original: "원문 X",
  other: "기타",
};

export const officialVerificationStatusLabels: Record<OfficialVerificationStatus, string> = {
  needs_manual_review: "수동 검토 필요",
  official_confirmed: "공식 출처 확인됨",
  contradicted: "반박됨",
  rejected_as_rumor: "루머 처리됨",
};

export const OFFICIAL_SOURCE_NOTICE = "공식 확인 전에는 사실로 단정하지 마세요.";
