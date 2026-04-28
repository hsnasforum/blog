import type {
  CommunityRiskLevel,
  CommunitySignalType,
  CommunityVerificationStatus,
} from "@/lib/community/community-types";

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

export function unixSeconds(date: Date) {
  return Math.floor(date.getTime() / 1000);
}

export function daysSince(date: Date | null | undefined) {
  if (!date) return 999;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

export function stripHtmlTags(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/\s+/g, " ").slice(0, 500);
  }

  return "unknown_error";
}

export function summarizeSignal(title: string, sourceName: string) {
  return `${sourceName}에서 확인된 공개 반응: ${title}`.slice(0, 300);
}

export function classifySignalType(text: string): CommunitySignalType {
  const normalized = text.toLowerCase();

  if (/rumor|루머|소문|unconfirmed|미확인|유출|찌라시|카더라|트윗|x발|\bx\b/.test(normalized)) {
    return "rumor";
  }
  if (/가격|과금|정액제|종량제|결제|pricing|subscription|billing/.test(normalized)) return "pricing_change";
  if (/breaking[-_\s]?change|breaking|regression|deprecat|major\s*change|호환성|회귀|깨짐/.test(normalized)) {
    return "breaking_change";
  }
  if (/documentation|docs|readme|guide|문서|가이드|예제/.test(normalized)) return "documentation_issue";
  if (/완전\s*섭종|섭종|서비스\s*종료|제공\s*중단|중단|지원\s*종료|shutdown|sunset|discontinued/.test(normalized)) {
    return "service_change";
  }
  const isBugBounty = /bug\s*bounty|버그\s*바운티|버그\s*바운더리/.test(normalized);
  if (!isBugBounty && /error|crash|regression|broken|오류|에러|크래시|작동\s*안\s*됨|작동\s*안됨|회귀/.test(normalized)) {
    return "bug_report";
  }
  if (!isBugBounty && /breaking|fail|failure|실패|깨짐|날려버림/.test(normalized)) return "operational_issue";
  if (/confusing|how to|why|beginner|newbie|초보|헷갈|어떻게|왜/.test(normalized)) {
    return "beginner_confusion";
  }
  if (/deploy|ops|operat|migration|rate limit|quota|운영|배포|마이그레이션|제한/.test(normalized)) {
    return "operational_issue";
  }
  if (/vs|compare|tradeoff|pros|cons|debate|비교|갈림|장단점/.test(normalized)) return "divided_opinion";
  if (/속보|예정|제작중|곧\s*지원/.test(normalized)) return "early_news";
  if (/출시|공개|발표|소개|제공|지원|가능|모델|업데이트|official|release|launch|update/.test(normalized)) {
    return "product_update";
  }
  if (/love|useful|great|works well|장점|좋다|유용/.test(normalized)) return "common_strength";
  return "common_complaint";
}

export function isSafeHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function detectCommunityRisk(text: string): {
  riskLevel: CommunityRiskLevel;
  verificationStatus: CommunityVerificationStatus;
  riskKeywords: string[];
} {
  const normalized = text.toLowerCase();
  const mediumPatterns = [
    { label: "예정", pattern: /예정/ },
    { label: "곧 지원", pattern: /곧\s*지원/ },
    { label: "제공 중단 예정", pattern: /제공\s*중단\s*예정/ },
    { label: "완전 섭종", pattern: /완전\s*섭종/ },
    { label: "제작중", pattern: /제작중/ },
    { label: "속보", pattern: /속보/ },
    { label: "트윗", pattern: /트윗/ },
    { label: "X", pattern: /\bx\b/ },
    { label: "X발", pattern: /x발/ },
    { label: "캡처", pattern: /캡처/ },
    { label: "스샷", pattern: /스샷/ },
  ];
  const highPatterns = [
    { label: "유출", pattern: /유출/ },
    { label: "찌라시", pattern: /찌라시/ },
    { label: "카더라", pattern: /카더라/ },
    { label: "미확인", pattern: /미확인/ },
  ];
  const matchedHigh = highPatterns.filter((item) => item.pattern.test(normalized)).map((item) => item.label);
  const matchedMedium = mediumPatterns.filter((item) => item.pattern.test(normalized)).map((item) => item.label);
  const hasStrongNumericClaim = /\b\d{1,3}\s*%\s*(?:하락|폭락|감소)\b|50\s*%\s*하락/.test(normalized);
  const matched = [...matchedHigh, ...matchedMedium, ...(hasStrongNumericClaim ? ["강한 수치 단정"] : [])];

  if (matchedHigh.length > 0 || hasStrongNumericClaim) {
    return {
      riskLevel: "high",
      verificationStatus: "needs_manual_review",
      riskKeywords: matched,
    };
  }

  if (matched.length > 0) {
    return {
      riskLevel: "medium",
      verificationStatus: "community_only",
      riskKeywords: matched,
    };
  }

  return {
    riskLevel: "low",
    verificationStatus: "community_only",
    riskKeywords: [],
  };
}
