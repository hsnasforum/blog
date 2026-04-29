import type { WriterSourceContext } from "@/lib/writer/source-context";

export type ArticlePrimaryIntent =
  | "community_rumor_watch"
  | "model_comparison_guide"
  | "project_devlog"
  | "general_guide";

export type ArticleIntentOverlay = "rumor_safety_overlay";

export type ArticleIntent = {
  primaryIntent: ArticlePrimaryIntent;
  overlays: ArticleIntentOverlay[];
  allowInternalImplementationContext: boolean;
};

const modelComparisonPattern = /차이|비교|선택\s*기준|작업\s*기준|언제\s*쓰|어떤\s*작업|Opus\s*Sonnet|Sonnet\s*Opus/i;
const rumorPattern = /중단설|루머|찌라시|떡밥|카더라|미확인|제공\s*중단/i;
const explicitProjectDevlogPattern =
  /REFUSE\s*HUB|WriterService|GenerationLog|Tistory\s*Export|Blog\s*Automation|블로그\s*자동화\s*(구현|개발|MVP)|구현기|개발일지|API\s*route|DB\s*model/i;

export const publicArticleForbiddenTerms = [
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
  "fallback provider",
  "scoring v2",
  "TrendCandidate",
  "sourceMetaJson",
  "needs_manual_review",
  "official_confirmed",
  "approved=false",
  "publish API",
];

const publicArticleForbiddenPatterns = [
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
  { label: "needs_manual_review", pattern: /\bneeds_manual_review\b/i },
  { label: "official_confirmed", pattern: /\bofficial_confirmed\b/i },
  { label: "approved=false", pattern: /approved\s*=\s*false/i },
  { label: "publish API", pattern: /publish\s*API/i },
];

const ifThenPatterns = [
  /\bif\b[\s\S]{0,160}\bthen\b/i,
  /^\s*if\s+/im,
  /\bthen\s+/i,
];

const publicTagForbiddenPattern =
  /WriterService|GenerationLog|approval\s*guard|oauth-proxy|OpenAI-compatible\s*provider|API\s*Route|Tistory\s*Export|provider\s*success\s*E2E|TrendCandidate|sourceMetaJson|needs_manual_review|자동화|SEO/i;

export const modelComparisonRumorTags = [
  "Claude Code",
  "Claude Opus",
  "Claude Sonnet",
  "Opus Sonnet 차이",
  "Claude Code 모델 선택",
  "Claude Code Opus",
  "Opus 중단설",
  "AI 코딩 도구",
  "모델 선택 기준",
  "Anthropic",
];

const defensiveAuditPhrasePatterns = [
  { label: "defensive official-source preface", pattern: /현재\s*이\s*글에서\s*공식\s*자료를\s*근거로/i },
  { label: "cannot assert audit phrase", pattern: /단정할\s*수는\s*없습니다/i },
  { label: "all 확인 필요 audit phrase", pattern: /모두\s*확인\s*필요로\s*두는\s*것이\s*안전합니다/i },
  { label: "current input 기준 phrase", pattern: /현재\s*입력\s*기준/i },
  { label: "no official source audit phrase", pattern: /공식\s*확인된\s*자료는\s*없습니다/i },
  { label: "검수형 확인 필요 항목 phrase", pattern: /공식\s*확인\s*전까지는\s*확인\s*필요\s*항목입니다/i },
];

function compactText(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function hasDcinsideSignal(sourceContext?: WriterSourceContext | null) {
  return sourceContext?.communitySignal?.sourceType === "dcinside";
}

function hasRumorOverlay(text: string, sourceContext?: WriterSourceContext | null) {
  return rumorPattern.test(text) || hasDcinsideSignal(sourceContext);
}

export function classifyArticleIntent(input: {
  rawTopic?: string | null;
  keyword?: string | null;
  title?: string | null;
  angle?: string | null;
  memo?: string | null;
  rationale?: string | null;
  sourceContext?: WriterSourceContext | null;
}): ArticleIntent {
  const text = compactText([input.rawTopic, input.keyword, input.title, input.angle, input.memo, input.rationale]);
  const overlays: ArticleIntentOverlay[] = hasRumorOverlay(text, input.sourceContext) ? ["rumor_safety_overlay"] : [];
  const isProjectDevlog = explicitProjectDevlogPattern.test(text);

  if (isProjectDevlog) {
    return {
      primaryIntent: "project_devlog",
      overlays,
      allowInternalImplementationContext: true,
    };
  }

  if (modelComparisonPattern.test(text)) {
    return {
      primaryIntent: "model_comparison_guide",
      overlays,
      allowInternalImplementationContext: false,
    };
  }

  if (overlays.includes("rumor_safety_overlay")) {
    return {
      primaryIntent: "community_rumor_watch",
      overlays,
      allowInternalImplementationContext: false,
    };
  }

  return {
    primaryIntent: "general_guide",
    overlays,
    allowInternalImplementationContext: false,
  };
}

export function hasRumorSafetyOverlay(intent: ArticleIntent) {
  return intent.overlays.includes("rumor_safety_overlay");
}

export function findPublicArticleDraftViolations(draft: string, intent: ArticleIntent) {
  if (intent.allowInternalImplementationContext) return [];

  const violations = publicArticleForbiddenPatterns
    .filter(({ pattern }) => pattern.test(draft))
    .map(({ label }) => label);

  if (ifThenPatterns.some((pattern) => pattern.test(draft))) {
    violations.push("if/then");
  }

  if (intent.primaryIntent === "model_comparison_guide" && hasRumorSafetyOverlay(intent)) {
    violations.push(
      ...defensiveAuditPhrasePatterns.filter(({ pattern }) => pattern.test(draft)).map(({ label }) => label),
    );
  }

  return violations;
}

export function hasIfThenViolation(text: string) {
  return ifThenPatterns.some((pattern) => pattern.test(text));
}

export function normalizePublicArticleTags(raw: unknown, fallback: string[], intent: ArticleIntent) {
  const sourceTags = Array.isArray(raw) ? raw.map((tag) => String(tag).replace(/\s+/g, " ").trim()) : fallback;
  const preferred =
    intent.primaryIntent === "model_comparison_guide" && hasRumorSafetyOverlay(intent)
      ? modelComparisonRumorTags
      : fallback;
  const result: string[] = [];

  for (const tag of [...sourceTags, ...preferred]) {
    if (!tag) continue;
    if (!intent.allowInternalImplementationContext && publicTagForbiddenPattern.test(tag)) continue;
    if (!result.includes(tag)) result.push(tag);
    if (result.length >= 10) break;
  }

  return result.slice(0, 10);
}
