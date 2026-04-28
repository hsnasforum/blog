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

export const officialSourceTypeGuidance: Record<OfficialSourceType, string> = {
  official_doc: "공식 문서는 official_confirmed 후보로 볼 수 있습니다.",
  official_blog: "공식 블로그는 official_confirmed 후보로 볼 수 있습니다.",
  github_release: "GitHub Release는 official_confirmed 후보로 볼 수 있습니다.",
  github_issue: "GitHub Issue는 논의/추적 출처이므로 needs_manual_review 유지가 권장됩니다.",
  news: "뉴스는 보강 출처입니다. 공식 발표와 분리해서 확인하세요.",
  x_original: "X 원문은 원문 확인 출처입니다. 공식 계정 여부를 별도로 확인하세요.",
  other: "기타 출처는 수동 검토가 필요합니다.",
};

export const recommendedVerificationStatusBySourceType: Record<OfficialSourceType, OfficialVerificationStatus> = {
  official_doc: "official_confirmed",
  official_blog: "official_confirmed",
  github_release: "official_confirmed",
  github_issue: "needs_manual_review",
  news: "needs_manual_review",
  x_original: "needs_manual_review",
  other: "needs_manual_review",
};

export const officialVerificationStatusLabels: Record<OfficialVerificationStatus, string> = {
  needs_manual_review: "수동 검토 필요",
  official_confirmed: "공식 출처 확인됨",
  contradicted: "반박됨",
  rejected_as_rumor: "루머 처리됨",
};

export const officialVerificationStatusGuidance: Record<OfficialVerificationStatus, string> = {
  needs_manual_review: "아직 수동 검토가 필요한 출처입니다. write_now는 허용하지 않습니다.",
  official_confirmed: "공식 문서/공식 블로그/릴리즈/공식 계정 원문을 확인했나요?",
  contradicted: "기존 커뮤니티 신호와 충돌하는 출처를 확인했나요?",
  rejected_as_rumor: "루머로 판단한 근거를 note에 남겨주세요.",
};

export const officialWriteNowRules = [
  "community_only: write_now 불가",
  "needs_manual_review: write_now 불가",
  "official_confirmed + risk low: write_now 가능",
  "official_confirmed + risk medium: review_first 유지",
  "contradicted/rejected_as_rumor: reject",
] as const;

export const OFFICIAL_SOURCE_NOTICE = "공식 확인 전에는 사실로 단정하지 마세요.";
