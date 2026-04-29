import type { WriterSourceContext } from "@/lib/writer/source-context";

const communityRumorWatchSourceTypes = new Set(["dcinside"]);
const communityRumorWatchVerificationStatuses = new Set(["community_only", "needs_manual_review"]);

export const communityRumorWatchInternalTerms = [
  "WriterService",
  "GenerationLog",
  "approval guard",
  "provider success E2E",
  "API route",
  "/api/",
  "DB model",
  "oauth-proxy",
  "OpenAI-compatible provider",
  "Tistory Export",
  "fallback provider 설계",
  "fallback provider",
  "scoring v2",
  "TrendCandidate",
  "sourceMetaJson",
  "verificationStatus",
  "needs_manual_review",
  "official_confirmed",
  "approved=false",
  "publish API",
  "자동 발행 구조",
];

export const communityRumorWatchPreferredTags = [
  "Claude Code",
  "Claude Pro",
  "Claude Opus",
  "Opus 제공 중단설",
  "Claude Code 이슈",
  "AI 코딩 도구",
  "Anthropic",
  "개발자 요금제",
  "모델 제공 정책",
  "AI 도구 루머",
];

export const communityRumorWatchTitleExamples = [
  "Claude Code Opus 제공 중단설, 지금 확인해야 할 것들",
  "Claude Code에서 Opus가 빠진다는 말이 도는 이유와 확인할 점",
  "Claude Code Opus 중단설을 바로 믿기 전에 볼 것들",
];

export const communityRumorWatchStructure = [
  "커뮤니티에서 어떤 말이 돌고 있는지",
  "왜 사람들이 반응하는지",
  "GitHub Issues나 보강 신호에서 무엇이 보이는지",
  "아직 공식 확인이 안 된 부분",
  "내가 보기엔 무엇을 조심해야 하는지",
  "지금 할 수 있는 현실적인 대응",
  "개인적인 판단으로 마무리",
];

const communityRumorWatchForbiddenDraftPatterns = [
  { label: "WriterService", pattern: /\bWriterService\b/i },
  { label: "GenerationLog", pattern: /\bGenerationLog\b/i },
  { label: "approval guard", pattern: /approval\s*guard/i },
  { label: "provider success E2E", pattern: /provider\s*success\s*E2E/i },
  { label: "API route", pattern: /API\s*route/i },
  { label: "/api/", pattern: /\/api\//i },
  { label: "DB model", pattern: /DB\s*model/i },
  { label: "oauth-proxy", pattern: /oauth-proxy/i },
  { label: "OpenAI-compatible provider", pattern: /OpenAI-compatible\s*provider/i },
  { label: "Tistory Export", pattern: /Tistory\s*Export/i },
  { label: "fallback provider", pattern: /fallback\s*provider/i },
  { label: "scoring v2", pattern: /scoring\s*v2/i },
  { label: "TrendCandidate", pattern: /\bTrendCandidate\b/i },
  { label: "sourceMetaJson", pattern: /\bsourceMetaJson\b/i },
  { label: "verificationStatus", pattern: /\bverificationStatus\b/i },
  { label: "needs_manual_review", pattern: /\bneeds_manual_review\b/i },
  { label: "official_confirmed", pattern: /\bofficial_confirmed\b/i },
  { label: "approved=false", pattern: /approved\s*=\s*false/i },
  { label: "publish API", pattern: /publish\s*API/i },
  { label: "자동 발행 구조", pattern: /자동\s*발행\s*구조/i },
  { label: "meta description in body", pattern: /메타\s*설명\s*:|meta\s*description\s*:|metaDescription/i },
  { label: "tags in body", pattern: /태그\s*:|tags\s*:/i },
  { label: "review report in body", pattern: /검수\s*리포트\s*:|reviewReport/i },
];

const communityRumorWatchIfThenPatterns = [
  /\bif\b[\s\S]{0,160}\bthen\b/i,
  /^\s*if\s+/im,
  /\bthen\s+/i,
  /\bif\b[\s\S]{0,160};\s*if\b/i,
];

const communityRumorWatchForbiddenTagPattern =
  /WriterService|GenerationLog|approval\s*guard|oauth-proxy|API\s*Route|OpenAI-compatible\s*provider|provider\s*success\s*E2E|TrendCandidate|sourceMetaJson|needs_manual_review|Tistory\s*Export|자동화|SEO/i;

function normalizeTag(tag: string) {
  return tag.replace(/\s+/g, " ").trim();
}

export function isCommunityRumorWatchContext(sourceContext?: WriterSourceContext | null) {
  const signal = sourceContext?.communitySignal;
  if (!signal) return false;

  return (
    communityRumorWatchSourceTypes.has(signal.sourceType) &&
    communityRumorWatchVerificationStatuses.has(sourceContext.verificationStatus)
  );
}

export function buildCommunityRumorWatchFallbackTitle(sourceContext: WriterSourceContext | null | undefined, keyword: string) {
  const rawTitle = sourceContext?.communitySignal?.signalTitle || keyword;
  const normalized = rawTitle
    .replace(/\s+/g, " ")
    .replace(/\s*예정\s*$/g, "")
    .replace(/\s*확정\s*$/g, "")
    .trim();

  if (/중단/.test(normalized)) {
    return `${normalized}설, 지금 확인해야 할 것들`;
  }

  return `${normalized}, 공식 확인 전 확인해야 할 점`;
}

export function buildCommunityRumorWatchAngle(keyword: string) {
  return `${keyword}를 루머/커뮤니티 조기 신호로 다루고, 공식 확인 전 확인 기준과 개인적인 대응 방향을 정리`;
}

export function buildCommunityRumorWatchDraftRequirements(sourceContext: WriterSourceContext | null | undefined) {
  return {
    mode: "community_rumor_watch",
    structure: communityRumorWatchStructure,
    titleDirection: communityRumorWatchTitleExamples,
    sourceHandling: {
      communitySignal: sourceContext?.communitySignal,
      reinforcementSignals: sourceContext?.reinforcementSignals ?? [],
      rules: [
        "커뮤니티 신호는 사실 확정이 아니라 조기 신호로만 다룬다.",
        "GitHub Issues는 보강 신호이지 공식 발표가 아니다.",
        "공식 문서, 공식 블로그, 릴리즈, 상태 페이지가 없으면 중단 확정이라고 쓰지 않는다.",
        "공식 확인 전에는 검토형 표현을 유지한다.",
      ],
    },
    topicFocusRules: [
      "본문 중심은 Claude Code Opus 제공 중단설, 확인 포인트, 사용자 대응 기준이다.",
      "Codex, ChatGPT, Gemini CLI는 대체 도구 비교가 아니라 필요한 경우 보완 후보로 짧게만 언급한다.",
      "블로그 자동화 구조, 내부 앱 구현, 발행 자동화 설명으로 확장하지 않는다.",
    ],
    toneRules: [
      "이런 말이 돌고 있다",
      "아직 공식 확인은 없다",
      "개인적으로는 바로 갈아타기보다 대비책을 점검할 타이밍으로 본다",
      "GitHub Issue는 보강 신호이지 공식 발표는 아니다",
      "사용 중인 사람이라면 모델 선택 화면, 요금제 안내, 공식 changelog를 직접 확인하는 편이 낫다",
    ],
    languageRules: [
      "일반 블로그 문단에서 영어식 if/then 문장을 쓰지 않는다.",
      "조건은 자연스러운 한국어 문장으로 풀어쓴다.",
      "가짜 경험담을 만들지 않는다.",
      "직접 확인하지 않은 내용을 직접 경험처럼 쓰지 않는다.",
    ],
    forbiddenTerms: communityRumorWatchInternalTerms,
  };
}

export function findCommunityRumorWatchDraftViolations(draft: string) {
  const violations = communityRumorWatchForbiddenDraftPatterns
    .filter(({ pattern }) => pattern.test(draft))
    .map(({ label }) => label);

  if (communityRumorWatchIfThenPatterns.some((pattern) => pattern.test(draft))) {
    violations.push("if/then");
  }

  return violations;
}

export function isValidCommunityRumorWatchDraft(draft: string) {
  return draft.trim().length > 0 && findCommunityRumorWatchDraftViolations(draft).length === 0;
}

export function normalizeCommunityRumorWatchTags(raw: unknown) {
  const sourceTags = Array.isArray(raw) ? raw.map((tag) => normalizeTag(String(tag))) : [];
  const result: string[] = [];

  for (const tag of [...sourceTags, ...communityRumorWatchPreferredTags]) {
    if (!tag) continue;
    if (communityRumorWatchForbiddenTagPattern.test(tag)) continue;
    if (!result.includes(tag)) result.push(tag);
    if (result.length >= 10) break;
  }

  return result.slice(0, 10);
}

export function buildCommunityRumorWatchSeoRequirements() {
  return {
    mode: "community_rumor_watch",
    tagCount: "8-10",
    preferredTags: communityRumorWatchPreferredTags,
    forbiddenTags: [
      ...communityRumorWatchInternalTerms,
      "WriterService",
      "GenerationLog",
      "provider success E2E",
      "Next.js API Route",
      "내부 구현명",
      "AI",
      "자동화",
      "SEO",
    ],
    sourceTagRules: {
      maxSourceNameTags: 1,
      avoidDcinsideTagUnlessUseful: true,
    },
    metaDescriptionRules: [
      "120-145 Korean characters, hard maximum 150",
      "중단설, 공식 확인 전 확인 포인트, 독자가 지금 점검할 것을 한 문장으로 요약한다.",
      "대체 도구 비교나 내부 구현 설명을 metaDescription 중심에 두지 않는다.",
    ],
  };
}
