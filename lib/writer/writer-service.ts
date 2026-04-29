import type { BlogProfile, Post } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  FALLBACK_REASON,
  type GenerationStatus,
  type WriterGenerationResult,
} from "@/lib/writer/generation-status";
import {
  createWriterProvider,
  getWriterRuntime,
} from "@/lib/writer/provider-factory";
import type { WriterCompletionInput } from "@/lib/writer/providers/base-provider";
import type { WriterSourceContext } from "@/lib/writer/source-context";
import {
  classifyArticleIntent,
  findPublicArticleDraftViolations,
  hasRumorSafetyOverlay,
  modelComparisonRumorTags,
  normalizePublicArticleTags,
  publicArticleForbiddenTerms,
  type ArticleIntent,
} from "@/lib/writer/article-intent";
import {
  buildCommunityRumorWatchAngle,
  buildCommunityRumorWatchDraftRequirements,
  buildCommunityRumorWatchFallbackTitle,
  buildCommunityRumorWatchSeoRequirements,
  communityRumorWatchInternalTerms,
  communityRumorWatchPreferredTags,
  communityRumorWatchStructure,
  communityRumorWatchTitleExamples,
  findCommunityRumorWatchDraftViolations,
  isCommunityRumorWatchContext,
  normalizeCommunityRumorWatchTags,
} from "@/lib/writer/community-writing-mode";

type KeywordCandidate = {
  keyword: string;
  rationale: string;
  titleCandidates: string[];
};

type CandidateVerdict = "write_now" | "review_first" | "hold" | "reject";
type PostWorkflowStep = "outline" | "draft" | "review" | "approved";
type ScoreBasis = "external_data" | "estimated_without_external_data";
type ScoreConfidence = "low" | "medium" | "high";

type ScoreResult = {
  id: string;
  scoringBasis: ScoreBasis;
  searchGrowthScore: number;
  newsVelocityScore: number;
  communityHeatScore: number;
  blogFitScore: number;
  differentiationScore: number;
  lifespanScore: number;
  riskPenalty: number;
  totalScore: number;
  verdict: CandidateVerdict;
  confidence: ScoreConfidence;
  scoringVersion: "v2";
  scoringReason: string;
  isRecommended: boolean;
  angleRecommendation: string;
  recommendationReason: string;
};

type AngleResult = {
  angle: string;
  title: string;
  reason: string;
  titleCandidates: string[];
};

type OutlineResult = {
  title: string;
  outline: string;
};

type DraftResult = {
  draft: string;
};

type ReviewResult = {
  reviewReport: string;
};

type SeoPackageResult = {
  seoPackage: string;
};

const jsonCodeBlockPattern = /```(?:json)?\s*([\s\S]*?)```/i;
const scoringVersion = "v2" as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(text: string) {
  return text.toLowerCase().trim();
}

function splitList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,]/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function summarize(text: string, max = 280): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 3)}...`;
}

function getProviderError(error: unknown): string {
  return error instanceof Error ? summarize(error.message, 500) : "unknown_error";
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  const candidate = raw.match(jsonCodeBlockPattern)?.[1] ?? raw;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return fallback;
  }
}

function normalizeMetaDescription(raw: unknown): string {
  const description = String(raw ?? "").replace(/\s+/g, " ").trim();

  return description.length > 150 ? description.slice(0, 150).trim() : description;
}

function normalizeSeoTags(raw: unknown, fallback: string[]) {
  const tags = Array.isArray(raw) ? raw.map((tag) => String(tag).trim()).filter(Boolean) : fallback;
  const blockedTagPattern =
    /provider\s*success\s*e2e|generationlog|writerservice|approval\s*guard|openai-compatible\s*provider|next\.?js\s*api\s*route|tistory\s*export|api\s*route|내부\s*구현명|내부\s*테스트|test:e2e/i;
  const broadStandaloneTags = new Set(["AI", "SEO", "자동화"]);
  const result: string[] = [];
  let dcinsideTagCount = 0;

  for (const tag of tags) {
    if (blockedTagPattern.test(tag)) continue;
    if (broadStandaloneTags.has(tag)) continue;
    if (/dcinside|디씨|특이점갤/i.test(tag)) {
      if (dcinsideTagCount >= 1) continue;
      dcinsideTagCount += 1;
    }
    if (!result.includes(tag)) result.push(tag);
  }

  return result.slice(0, 10);
}

function buildStandardDraftRequirements() {
  return {
    recommendedLength: "6,000-9,000 Korean characters",
    maxH2Sections: "6-7",
    useH3OnlyWhenNecessary: true,
    maxCodeBlocks: 2,
    maxTables: 2,
    maxFailureCases: 3,
    maxConditionalRuleGroups: 4,
    compressionRulesForHighReasoningModels: [
      "Think deeply but write compactly.",
      "Select only important conditions and exceptions.",
      "Do not repeat the same conclusion in multiple sections.",
      "Prefer reader decision criteria over internal implementation detail.",
      "Keep the article readable as a blog post, not a design document.",
    ],
    minimumConcreteExamples: 3,
    minimumConditionalRules: 3,
    minimumFailureCases: 2,
    requiredExampleTypes: [
      "DB model example",
      "API route example",
      "provider selection example",
      "failure handling example",
      "review or approval condition example",
      "operator UI/workflow example",
    ],
    suggestedFailureCases: [
      "provider connection failed but UI looked like success",
      "post could become approved before reviewReport existed",
      "scoring sent a practical candidate to hold",
      "PowerShell inline test script triggered Defender detection",
    ],
    claimSafetyRules: [
      "Use 현재 구현 기준 for implementation-specific statements.",
      "Use 추정 when external trend/search/news/community data is missing.",
      "Use 확인 필요 for latest API behavior, pricing, policy, security, or product feature claims.",
      "Do not claim traffic, ranking, cost saving, or productivity improvement as guaranteed.",
    ],
    scopeRules: [
      "writing automation MVP is in scope",
      "automatic publishing is out of scope or later phase",
      "server API routes must mediate model calls",
      "do not expose API keys or OAuth tokens to browser",
    ],
    internalTermRules: {
      limitInternalTermsInHeadingsAndTitle: true,
      useAsRefuseHubImplementationExamplesOnly: true,
      explainBeforeUse: {
        WriterService: "초안 생성 서비스",
        GenerationLog: "생성 로그",
        "approval guard": "승인 차단 로직",
        "scoring v2": "글감 점수 계산 규칙",
        "oauth-proxy": "로컬 인증 프록시",
        "provider success E2E": "provider 연결 검증 테스트",
      },
      preferPlainLanguageFirst: [
        "초안 생성 서비스",
        "생성 로그",
        "승인 차단 로직",
        "글감 점수 계산 규칙",
        "로컬 인증 프록시",
        "provider 연결 검증 테스트",
      ],
    },
    codeExampleRules: [
      "Use short pseudocode only.",
      "Do not provide full copy-paste implementation.",
      "Add a caution that authentication, authorization, input validation, and exception handling must be adapted to the actual project.",
    ],
  };
}

function keywordFallback(topic: string, optionalKeywords: string[] = []): KeywordCandidate[] {
  const base = topic.trim();
  const seeds = [...optionalKeywords];
  if (base) {
    seeds.unshift(base);
  }

  const templates = [
    "입문 가이드",
    "실무 적용 사례",
    "비교 분석",
    "체크리스트",
    "실패 사례와 회피법",
    "툴 선택 기준",
    "2026 트렌드 전망",
    "생산성 자동화 루틴",
    "비용-효율 분석",
    "리스크 관리",
    "초보자가 흔히 하는 실수",
    "팀 없이 1인 운영하는 방법",
  ];

  const unique = new Set<string>();
  const results: KeywordCandidate[] = [];

  for (const seed of seeds) {
    for (const template of templates) {
      if (results.length >= 20) break;
      const keyword = `${seed} ${template}`.trim();
      if (unique.has(keyword)) continue;
      unique.add(keyword);
      results.push({
        keyword,
        rationale: `${seed} 주제에서 검색 의도와 실행 니즈가 자주 겹치는 패턴입니다.`,
        titleCandidates: [
          `${seed}: ${template}`,
          `${seed} ${template} 핵심 정리`,
          `${seed} ${template} 바로 적용하기`,
        ],
      });
    }
  }

  while (results.length < 10 && base) {
    const index = results.length + 1;
    const keyword = `${base} 실전 포인트 ${index}`;
    if (!unique.has(keyword)) {
      unique.add(keyword);
      results.push({
        keyword,
        rationale: "핵심 주제를 분해한 보완 키워드입니다.",
        titleCandidates: [
          `${keyword} 정리`,
          `${keyword} 체크리스트`,
          `${keyword} 바로 쓰는 방법`,
        ],
      });
    }
  }

  return results.slice(0, 20);
}

function uniqueList(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function compactForMatch(text: string) {
  return normalizeText(text).replace(/\s+/g, "");
}

function includesTerm(text: string, term: string) {
  if (!term.trim()) return false;
  const normalizedText = normalizeText(text);
  const normalizedTerm = normalizeText(term);
  return normalizedText.includes(normalizedTerm) || compactForMatch(text).includes(compactForMatch(term));
}

function stripKoreanPostposition(token: string) {
  const suffixes = [
    "으로",
    "에서",
    "에게",
    "까지",
    "부터",
    "처럼",
    "보다",
    "이나",
    "와",
    "과",
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "에",
    "의",
    "로",
    "도",
    "만",
  ];

  for (const suffix of suffixes) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 2) {
      return token.slice(0, -suffix.length);
    }
  }

  return token;
}

function extractScoringTerms(raw: string | null | undefined): string[] {
  if (!raw) return [];

  const stopWords = new Set([
    "같은",
    "너무",
    "단순",
    "있는",
    "없는",
    "중에서",
    "지금",
    "쓸",
    "만한",
    "글감을",
    "찾고",
    "싶다",
    "관심",
    "위한",
    "그리고",
    "또는",
    "정리",
  ]);

  return uniqueList(
    raw
      .split(/[\s,./|:;()[\]{}"'`~!?\n\r\t<>]+/)
      .map((token) => stripKoreanPostposition(normalizeText(token)))
      .filter((token) => token.length >= 2 && !stopWords.has(token)),
  );
}

function parseTitleCandidates(raw: string | null | undefined): string[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function findMatches(text: string, signals: string[]): string[] {
  return uniqueList(signals.filter((signal) => includesTerm(text, signal)));
}

function countSignal(text: string, signals: string[]): number {
  return findMatches(text, signals).length;
}

function computeVerdict(totalScore: number, scoringBasis: ScoreBasis): CandidateVerdict {
  if (scoringBasis === "external_data" && totalScore >= 80) return "write_now";
  if (totalScore >= 65) return "review_first";
  if (totalScore >= 50) return "hold";
  return "reject";
}

function computeConfidence(params: {
  scoringBasis: ScoreBasis;
  totalScore: number;
  matchedInputCount: number;
  riskPenalty: number;
}): ScoreConfidence {
  if (params.scoringBasis === "external_data" && params.totalScore >= 80 && params.riskPenalty > -8) {
    return "high";
  }

  if (params.totalScore >= 65 && params.matchedInputCount >= 3 && params.riskPenalty > -10) {
    return "medium";
  }

  if (params.totalScore >= 55 && params.matchedInputCount >= 2 && params.riskPenalty > -16) {
    return "medium";
  }

  return "low";
}

function buildScoringReason(params: {
  scoringBasis: ScoreBasis;
  matchedInputs: string[];
  strengths: string[];
  risks: string[];
  totalScore: number;
  confidence: ScoreConfidence;
}) {
  const basisText =
    params.scoringBasis === "estimated_without_external_data"
      ? "외부 검색/뉴스/커뮤니티 데이터 없이 후보 텍스트, 사용자 입력, BlogProfile만으로 계산한 추정 점수입니다."
      : "외부 데이터가 반영된 점수입니다.";
  const matchedText =
    params.matchedInputs.length > 0
      ? `입력 키워드 매칭: ${params.matchedInputs.slice(0, 8).join(", ")}.`
      : "입력 키워드와의 직접 매칭은 약합니다.";
  const strengthText =
    params.strengths.length > 0
      ? `강점: ${uniqueList(params.strengths).slice(0, 5).join(", ")}.`
      : "강점 신호가 제한적입니다.";
  const riskText =
    params.risks.length > 0
      ? `리스크: ${uniqueList(params.risks).slice(0, 5).join(", ")}.`
      : "큰 avoidTopics 충돌은 감지되지 않았습니다.";

  return `${basisText} ${matchedText} ${strengthText} ${riskText} confidence=${params.confidence}, total=${params.totalScore}.`;
}

function buildRecommendationReason(verdict: CandidateVerdict, scoringBasis: ScoreBasis) {
  if (verdict === "write_now") {
    return "바로 작성 추천: 외부 데이터와 블로그 적합도가 충분히 높습니다.";
  }

  if (verdict === "review_first") {
    return scoringBasis === "estimated_without_external_data"
      ? "검토 후 작성 추천: 실무성과 블로그 적합도는 높지만 외부 데이터가 없어 write_now는 제한했습니다."
      : "검토 후 작성 추천: 점수는 충분하지만 사람 검토 후 진행하는 것이 안전합니다.";
  }

  if (verdict === "hold") {
    return "보류: 일부 신호는 있으나 작성 우선순위가 높지는 않습니다. 외부 데이터 확인 후 재평가를 권장합니다.";
  }

  return "제외 권장: 입력 의도, 블로그 적합도, 차별화 신호가 부족하거나 avoidTopics 리스크가 큽니다.";
}

export class WriterService {
  private async complete(input: WriterCompletionInput): Promise<string> {
    const provider = await createWriterProvider();
    return provider.complete(input);
  }

  private async withLog<T>({
    action,
    inputSummary,
    runner,
    outputSummary,
    onErrorFallback,
  }: {
    action: string;
    inputSummary: string;
    runner: () => Promise<T>;
    outputSummary: (result: T) => string;
    onErrorFallback?: (error: unknown) => T;
  }): Promise<WriterGenerationResult<T>> {
    const runtime = await getWriterRuntime();

    try {
      const result = await runner();
      const generationStatus: GenerationStatus = "success";
      await prisma.generationLog.create({
        data: {
          action,
          provider: runtime.provider,
          model: runtime.model,
          inputSummary: summarize(
            `${inputSummary}, reasoningEffort=${runtime.reasoningEffort}${
              runtime.reasoningEffortWarning ? ", reasoningEffortWarning=invalid_env_fallback" : ""
            }`,
          ),
          outputSummary: summarize(outputSummary(result)),
          status: generationStatus,
          generationStatus,
        },
      });
      return {
        data: result,
        generationStatus,
      };
    } catch (error) {
      if (onErrorFallback) {
        const fallback = onErrorFallback(error);
        const generationStatus: GenerationStatus = "fallback";
        const providerError = getProviderError(error);
        await prisma.generationLog.create({
          data: {
            action,
            provider: runtime.provider,
            model: runtime.model,
            inputSummary: summarize(
              `${inputSummary}, reasoningEffort=${runtime.reasoningEffort}${
                runtime.reasoningEffortWarning ? ", reasoningEffortWarning=invalid_env_fallback" : ""
              }`,
            ),
            outputSummary: summarize(outputSummary(fallback)),
            status: generationStatus,
            generationStatus,
            errorMessage: providerError,
          },
        });
        return {
          data: fallback,
          generationStatus,
          providerError,
          fallbackReason: FALLBACK_REASON,
        };
      }

      const generationStatus: GenerationStatus = "failed";
      await prisma.generationLog.create({
        data: {
          action,
          provider: runtime.provider,
          model: runtime.model,
          inputSummary: summarize(
            `${inputSummary}, reasoningEffort=${runtime.reasoningEffort}${
              runtime.reasoningEffortWarning ? ", reasoningEffortWarning=invalid_env_fallback" : ""
            }`,
          ),
          outputSummary: null,
          status: generationStatus,
          generationStatus,
          errorMessage: getProviderError(error),
        },
      });
      throw error;
    }
  }

  private async generateCommunityRumorWatchDraft(params: {
    post: Pick<Post, "id" | "title" | "angle" | "outline">;
    rawTopic: string;
    keyword: string;
    blogProfile: BlogProfile;
    sourceContext: WriterSourceContext | null | undefined;
    fallbackDraft: string;
  }) {
    const sourceContext = params.sourceContext;
    const sourceMaterial = {
      communitySignal: sourceContext?.communitySignal,
      reinforcementSignals: (sourceContext?.reinforcementSignals ?? []).slice(0, 3).map((signal) => ({
        title: signal.title,
        url: signal.url,
        repository: signal.repository,
        commentCount: signal.commentCount,
        reactionCount: signal.reactionCount,
        updatedAt: signal.updatedAt,
        verificationStatus: signal.verificationStatus,
      })),
      officialSources: sourceContext?.officialSources ?? [],
      officialSourceStatus:
        sourceContext?.officialSources && sourceContext.officialSources.length > 0 ? "official sources provided" : "공식 확인 없음",
      verificationStatus: sourceContext?.verificationStatus,
      riskLevel: sourceContext?.riskLevel,
    };
    const bannedTerms = communityRumorWatchInternalTerms.join(", ");
    const baseMessages: WriterCompletionInput["messages"] = [
      {
        role: "system",
        content: [
          "You are writing a Korean personal blog article in community_rumor_watch mode.",
          "Return markdown article body only. Do not return SEO metadata, tags, review report, JSON, or export package.",
          "This mode is a hard override. Do not use any generic technical implementation article rules.",
          "Allowed flow only: 루머/떡밥 감지 → 자료 확인 → 내 판단 → 대응 기준.",
          "Use exactly these H2 sections:",
          "1. 지금 어떤 말이 돌고 있나",
          "2. 왜 사람들이 민감하게 보는가",
          "3. GitHub 이슈나 보강 신호에서는 무엇이 보이나",
          "4. 아직 확인해야 할 것",
          "5. 개인적으로 보는 대응 방향",
          "6. 마무리",
          "Do not assert the community signal as confirmed fact.",
          "Use phrases like 이런 말이 돌고 있다, 아직 공식 확인은 없다, 확인 필요한 신호.",
          "GitHub Issues are reinforcement signals only, not official announcements.",
          "Mention alternatives such as Codex, ChatGPT, or Gemini CLI only briefly as backup candidates, never as the article center.",
          "Do not write English if/then conditional sentences. Do not use code blocks.",
          `Never include these internal implementation terms or topics: ${bannedTerms}.`,
          "Never discuss DB models, API routes, provider/fallback design, generation logs, approval workflow, Tistory export, publish API, or app architecture.",
          "Do not fabricate direct experience. If direct testing is not provided, phrase the ending as personal judgment or operating principle.",
          "End with a cautious personal judgment and a practical check principle.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          title: params.post.title,
          angle: params.post.angle,
          rawTopic: params.rawTopic,
          keyword: params.keyword,
          outline: params.post.outline,
          sourceMaterial,
          blogTone: params.blogProfile.defaultTone,
          requiredToneExamples: [
            "커뮤니티에서는 이런 이야기가 올라왔다.",
            "GitHub Issues 쪽에서도 비슷한 혼란을 말하는 글이 보이지만, 이것만으로 공식 변경이라고 보기는 어렵다.",
            "개인적으로는 바로 갈아타기보다, 내가 어떤 작업에서 Opus에 의존하고 있었는지 먼저 보는 편이 낫다고 본다.",
          ],
          forbiddenExamples: [
            "DB model에 GenerationLog 필드를 추가한다.",
            "/api/internal/generations route를 만든다.",
            "verificationStatus가 needs_manual_review이면...",
            "if 공식 확인이 나오면 then...",
          ],
        }),
      },
    ];

    const response = await this.complete({
      temperature: 0.2,
      messages: baseMessages,
    });
    const draft = response?.trim() || params.fallbackDraft;
    const violations = findCommunityRumorWatchDraftViolations(draft);
    if (violations.length === 0) return draft;

    const rewritten = await this.complete({
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: [
            "Rewrite the draft into community_rumor_watch mode and return markdown article body only.",
            "Remove every violation. Do not preserve forbidden implementation material.",
            "No if/then. No code blocks. No SEO metadata. No tags. No review report.",
            "Use only the six H2 sections requested by the user.",
            `Forbidden terms/topics: ${bannedTerms}.`,
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            violations,
            sourceMaterial,
            draft,
          }),
        },
      ],
    });
    const rewrittenDraft = rewritten?.trim() || params.fallbackDraft;
    const rewriteViolations = findCommunityRumorWatchDraftViolations(rewrittenDraft);

    return rewriteViolations.length === 0 ? rewrittenDraft : params.fallbackDraft;
  }

  private async generateModelComparisonGuideDraft(params: {
    post: Pick<Post, "id" | "title" | "angle" | "outline">;
    rawTopic: string;
    keyword: string;
    blogProfile: BlogProfile;
    sourceContext: WriterSourceContext | null | undefined;
    articleIntent: ArticleIntent;
    fallbackDraft: string;
  }) {
    const sourceContext = params.sourceContext;
    const sourceMaterial = {
      communitySignal: sourceContext?.communitySignal,
      reinforcementSignals: (sourceContext?.reinforcementSignals ?? []).slice(0, 3).map((signal) => ({
        title: signal.title,
        url: signal.url,
        repository: signal.repository,
        commentCount: signal.commentCount,
        reactionCount: signal.reactionCount,
        updatedAt: signal.updatedAt,
        verificationStatus: signal.verificationStatus,
      })),
      officialSources: sourceContext?.officialSources ?? [],
      officialSourceStatus:
        sourceContext?.officialSources && sourceContext.officialSources.length > 0 ? "official sources provided" : "공식 확인 없음",
      verificationStatus: sourceContext?.verificationStatus,
      riskLevel: sourceContext?.riskLevel,
      overlays: params.articleIntent.overlays,
    };
    const bannedTerms = publicArticleForbiddenTerms.join(", ");
    const baseMessages: WriterCompletionInput["messages"] = [
      {
        role: "system",
        content: [
          "You are writing a Korean public blog article in model_comparison_guide mode with rumor_safety_overlay when present.",
          "Return markdown article body only. Do not return SEO metadata, tags, review report, JSON, or export package.",
          "This mode is a hard override. Do not use internal project implementation examples.",
          "The article must answer the reader's practical question: when should Claude Code users choose Sonnet, and when is Opus worth using?",
          "Start with the conclusion: Sonnet은 기본 작업용, Opus는 실패 비용이 큰 작업용.",
          "Use exactly these H2 sections:",
          "1. 결론: Sonnet은 기본 작업, Opus는 실패 비용이 큰 작업",
          "2. 먼저 확인할 사실: Opus 전체 중단인지, 특정 모델 ID 퇴역인지",
          "3. Claude Code에서 Opus와 Sonnet의 실제 차이",
          "4. 작업별 추천 기준",
          "5. Opus 중단설 전에 확인할 체크리스트",
          "6. 추천 워크플로우",
          "7. 결론",
          "If official sources are missing, write 확인 필요 and do not assert shutdown or availability changes as fact.",
          "GitHub Issues are reinforcement signals only, not official announcements.",
          "Do not drift into REFUSE HUB internals, blog automation architecture, DB/API/provider/fallback design, approval workflows, or export logic.",
          "Do not write English if/then conditional sentences. Use natural Korean prose.",
          `Never include these internal implementation terms: ${bannedTerms}.`,
          "Keep alternatives like Codex, ChatGPT, or Gemini CLI secondary. The center is Opus/Sonnet task selection.",
          "End with a practical personal judgment about checking one's own account/model selector and not overreacting before official confirmation.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          title: params.post.title,
          angle: params.post.angle,
          rawTopic: params.rawTopic,
          keyword: params.keyword,
          outline: params.post.outline,
          sourceMaterial,
          blogTone: params.blogProfile.defaultTone,
          requiredConclusion:
            "Sonnet은 기본 작업용으로 두고, Opus는 실패 비용이 큰 설계·검토·난도 높은 디버깅에 제한적으로 쓰는 기준을 먼저 제시한다.",
          forbiddenExamples: [
            "DB model에 GenerationLog 필드를 추가한다.",
            "/api/internal/generations route에서 provider 호출 흐름 설명",
            "verificationStatus가 needs_manual_review이면...",
            "if 공식 확인이 나온다, then...",
          ],
        }),
      },
    ];

    const response = await this.complete({
      temperature: 0.2,
      messages: baseMessages,
    });
    const draft = response?.trim() || params.fallbackDraft;
    const violations = findPublicArticleDraftViolations(draft, params.articleIntent);
    if (violations.length === 0) return draft;

    const rewritten = await this.complete({
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: [
            "Rewrite the draft into model_comparison_guide mode and return markdown article body only.",
            "Remove every violation. Do not preserve forbidden implementation material.",
            "No if/then. No code blocks. No SEO metadata. No tags. No review report.",
            "Use only the seven H2 sections requested by the user.",
            "Keep the conclusion first: Sonnet is for default work, Opus is for high failure-cost work.",
            `Forbidden terms/topics: ${bannedTerms}.`,
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            violations,
            sourceMaterial,
            draft,
          }),
        },
      ],
    });
    const rewrittenDraft = rewritten?.trim() || params.fallbackDraft;
    const rewriteViolations = findPublicArticleDraftViolations(rewrittenDraft, params.articleIntent);

    return rewriteViolations.length === 0 ? rewrittenDraft : params.fallbackDraft;
  }

  async generateKeywordCandidates(params: {
    rawTopic: string;
    memo?: string | null;
    optionalKeywords?: string | null;
    avoidTopics?: string | null;
    blogProfile: BlogProfile;
  }): Promise<WriterGenerationResult<KeywordCandidate[]>> {
    const optional = splitList(params.optionalKeywords);
    const fallback = keywordFallback(params.rawTopic, optional);

    return this.withLog({
      action: "generateKeywordCandidates",
      inputSummary: `topic=${params.rawTopic}, memo=${params.memo ?? ""}`,
      outputSummary: (result) => `${result.length} candidates`,
      onErrorFallback: () => fallback,
      runner: async () => {
        const response = await this.complete({
          responseFormat: "json",
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content:
                "You are a blog strategy assistant. Return only JSON with key `candidates` (10-20 items).",
            },
            {
              role: "user",
              content: JSON.stringify({
                topic: params.rawTopic,
                memo: params.memo ?? "",
                optionalKeywords: optional,
                avoidTopics: splitList(params.avoidTopics),
                blogProfile: {
                  blogName: params.blogProfile.blogName,
                  targetAudience: params.blogProfile.targetAudience,
                  defaultTone: params.blogProfile.defaultTone,
                  preferredStructure: params.blogProfile.preferredStructure,
                },
                outputShape: {
                  candidates: [
                    {
                      keyword: "string",
                      rationale: "string",
                      titleCandidates: ["string", "string", "string"],
                    },
                  ],
                }
              }),
            },
          ],
        });

        const parsed = safeJsonParse<{ candidates?: KeywordCandidate[] }>(response, {});
        const candidates = parsed.candidates
          ?.map((candidate) => ({
            keyword: (candidate.keyword ?? "").trim(),
            rationale: (candidate.rationale ?? "").trim(),
            titleCandidates: Array.isArray(candidate.titleCandidates)
              ? candidate.titleCandidates.map((title) => String(title).trim()).filter(Boolean).slice(0, 3)
              : [],
          }))
          .filter((candidate) => candidate.keyword.length > 0 && candidate.rationale.length > 0);

        if (!candidates || candidates.length < 10) {
          return fallback;
        }

        return candidates.slice(0, 20);
      },
    });
  }

  async scoreTrendCandidates(params: {
    rawTopic: string;
    memo?: string | null;
    optionalKeywords?: string | null;
    avoidTopics?: string | null;
    blogProfile: BlogProfile;
    candidates: Array<{
      id: string;
      keyword: string;
      rationale: string;
      titleCandidates?: string | null;
      angleRecommendation?: string | null;
    }>;
  }): Promise<WriterGenerationResult<ScoreResult[]>> {
    const optionalKeywords = splitList(params.optionalKeywords);
    const avoidTopics = splitList(params.avoidTopics);
    const forbiddenPhrases = splitList(params.blogProfile.forbiddenPhrases);
    const profileTerms = uniqueList([
      ...splitList(params.blogProfile.targetAudience),
      ...splitList(params.blogProfile.defaultTone),
      ...splitList(params.blogProfile.preferredStructure),
      ...extractScoringTerms(params.blogProfile.targetAudience),
      ...extractScoringTerms(params.blogProfile.defaultTone),
      ...extractScoringTerms(params.blogProfile.preferredStructure),
    ]);
    const rawTopicTerms = uniqueList([params.rawTopic, ...extractScoringTerms(params.rawTopic)]);
    const memoTerms = extractScoringTerms(params.memo);
    const optionalTerms = uniqueList([...optionalKeywords, ...optionalKeywords.flatMap(extractScoringTerms)]);
    const inputSignals = uniqueList([...rawTopicTerms, ...optionalTerms, ...memoTerms]);

    return this.withLog({
      action: "scoreTrendCandidates",
      inputSummary: `topic=${params.rawTopic}, candidates=${params.candidates.length}`,
      outputSummary: (result) =>
        `scored=${result.length}, top=${result[0]?.totalScore ?? "n/a"}(${result[0]?.verdict ?? "n/a"})`,
      runner: async () => {
        const scoringBasis: ScoreBasis = "estimated_without_external_data";
        const freshnessSignals = [
          "2026",
          "2025",
          "최신",
          "트렌드",
          "업데이트",
          "출시",
          "생성형",
          "ai",
          "chatgpt",
          "api",
          "codex",
          "oauth",
          "프록시",
          "agent",
          "에이전트",
          "자동화",
          "로컬 llm",
          "llm",
          "구독",
          "스택",
        ];
        const actionSignals = [
          "전망",
          "비교",
          "스택",
          "선택",
          "기준",
          "체크리스트",
          "방법",
          "설정",
          "구성",
          "워크플로우",
          "파이프라인",
          "실무",
          "적용",
          "자동화",
          "비용",
          "효율",
          "검수",
        ];
        const differentiationSignals = [
          "비교",
          "스택",
          "api",
          "oauth",
          "codex",
          "프록시",
          "로컬 llm",
          "에이전트",
          "워크플로우",
          "파이프라인",
          "비용",
          "검수",
          "자동화",
          "선택 기준",
        ];
        const evergreenSignals = ["원리", "가이드", "체크리스트", "비교", "방법", "기준", "스택", "실무", "자동화"];
        const shortSignals = ["오늘", "속보", "실시간", "당일"];
        const hardRiskSignals = ["투자", "수익 보장", "치료", "법률 자문", "도박", "성인", "확정", "무조건"];
        const rumorSignals = ["루머", "소문", "미확인", "추측", "폭로"];
        const newsSummarySignals = ["뉴스", "요약", "속보", "발표 정리", "최신 소식"];
        const genericIntroSignals = ["ai란", "ai 란", "소개", "입문", "기초", "개념", "초보"];
        const hasNewsSummaryAvoid = avoidTopics.some((topic) => includesTerm(topic, "뉴스") || includesTerm(topic, "요약"));
        const hasRumorAvoid = avoidTopics.some((topic) => includesTerm(topic, "루머") || includesTerm(topic, "근거 없는"));
        const hasGenericIntroAvoid = avoidTopics.some(
          (topic) => includesTerm(topic, "일반적인") || includesTerm(topic, "소개글") || includesTerm(topic, "AI 소개"),
        );

        const scored = params.candidates.map((candidate) => {
          const titleText = parseTitleCandidates(candidate.titleCandidates).join(" ");
          const mergedText = `${candidate.keyword} ${candidate.rationale} ${candidate.angleRecommendation ?? ""} ${titleText}`;
          const matchedInputs = findMatches(mergedText, inputSignals);
          const matchedOptional = findMatches(mergedText, optionalKeywords);
          const matchedProfile = findMatches(mergedText, profileTerms);
          const freshnessCount = countSignal(mergedText, freshnessSignals);
          const actionabilityCount = countSignal(mergedText, actionSignals);
          const differentiationCount = countSignal(mergedText, differentiationSignals);
          const evergreenCount = countSignal(mergedText, evergreenSignals);
          const shortCount = countSignal(mergedText, shortSignals);
          const hardRiskCount = countSignal(mergedText, hardRiskSignals);
          const forbiddenCount = countSignal(mergedText, forbiddenPhrases);
          const directAvoidMatches = findMatches(mergedText, avoidTopics);
          const rumorConflict = hasRumorAvoid && countSignal(mergedText, rumorSignals) > 0;
          const newsSummaryConflict = hasNewsSummaryAvoid && countSignal(mergedText, newsSummarySignals) > 0;
          const genericIntroConflict =
            hasGenericIntroAvoid &&
            countSignal(mergedText, genericIntroSignals) > 0 &&
            differentiationCount < 2 &&
            actionabilityCount < 3;
          const riskItems = [
            ...directAvoidMatches.map((item) => `avoidTopics 직접 충돌: ${item}`),
            ...(rumorConflict ? ["근거 없는 루머 가능성"] : []),
            ...(newsSummaryConflict ? ["단순 뉴스 요약 가능성"] : []),
            ...(genericIntroConflict ? ["너무 일반적인 AI 소개글 가능성"] : []),
            ...(forbiddenCount > 0 ? ["BlogProfile forbiddenPhrases 충돌"] : []),
            ...(hardRiskCount > 0 ? ["과장/민감 주제 신호"] : []),
          ];

          const keywordMatchScore = clamp(6 + matchedOptional.length * 6 + matchedInputs.length * 2, 0, 25);
          const freshnessProxyScore = clamp(4 + freshnessCount * 2 + matchedOptional.length * 2, 0, 20);
          const actionabilityScore = clamp(4 + actionabilityCount * 3 + matchedProfile.length, 0, 20);

          const searchGrowthScore = clamp(
            Math.round(keywordMatchScore * 0.9 + freshnessProxyScore * 0.25 + matchedOptional.length),
            0,
            30,
          );
          const newsVelocityScore = clamp(freshnessProxyScore - Math.max(0, shortCount - 1) * 2, 0, 20);
          const communityHeatScore = clamp(
            Math.round(actionabilityScore * 0.75 + keywordMatchScore * 0.2 + matchedOptional.length * 2),
            0,
            20,
          );
          const blogFitScore = clamp(
            5 + matchedProfile.length * 2 + matchedOptional.length * 2 + (actionabilityCount > 0 ? 2 : 0) - forbiddenCount * 4,
            0,
            15,
          );
          const differentiationScore = clamp(
            4 + differentiationCount * 2 + matchedOptional.length - (genericIntroConflict ? 6 : 0) - (newsSummaryConflict ? 2 : 0),
            0,
            10,
          );
          const lifespanScore = clamp(2 + evergreenCount - shortCount, 0, 5);
          const riskPenalty = clamp(
            -(
              hardRiskCount * 8 +
              forbiddenCount * 6 +
              directAvoidMatches.length * 5 +
              (rumorConflict ? 10 : 0) +
              (newsSummaryConflict ? 8 : 0) +
              (genericIntroConflict ? 6 : 0)
            ),
            -30,
            0,
          );

          const uncappedTotalScore =
            searchGrowthScore +
            newsVelocityScore +
            communityHeatScore +
            blogFitScore +
            differentiationScore +
            lifespanScore +
            riskPenalty;

          const totalScore =
            scoringBasis === "estimated_without_external_data"
              ? Math.min(79, uncappedTotalScore)
              : uncappedTotalScore;
          const verdict = computeVerdict(totalScore, scoringBasis);
          const confidence = computeConfidence({
            scoringBasis,
            totalScore,
            matchedInputCount: matchedInputs.length,
            riskPenalty,
          });
          const isRecommended = verdict === "write_now" || verdict === "review_first";
          const strengths = [
            ...(matchedOptional.length > 0 ? [`optionalKeywords 매칭 ${matchedOptional.length}개`] : []),
            ...(matchedProfile.length > 0 ? [`BlogProfile 적합 신호 ${matchedProfile.length}개`] : []),
            ...(actionabilityCount >= 2 ? ["실행/판단 가능한 글감"] : []),
            ...(differentiationCount >= 2 ? ["차별화된 관점"] : []),
            ...(freshnessCount >= 2 ? ["최근성 proxy 신호"] : []),
          ];
          const scoringReason = buildScoringReason({
            scoringBasis,
            matchedInputs,
            strengths,
            risks: riskItems,
            totalScore,
            confidence,
          });
          const angleRecommendation = `${candidate.keyword}를 ${params.blogProfile.targetAudience} 관점에서 비교, 선택 기준, 실행 체크리스트 중심으로 구성`;
          const recommendationReason = buildRecommendationReason(verdict, scoringBasis);

          return {
            id: candidate.id,
            scoringBasis,
            searchGrowthScore,
            newsVelocityScore,
            communityHeatScore,
            blogFitScore,
            differentiationScore,
            lifespanScore,
            riskPenalty,
            totalScore,
            verdict,
            confidence,
            scoringVersion,
            scoringReason,
            isRecommended,
            angleRecommendation,
            recommendationReason,
          };
        });

        return scored.sort((a, b) => b.totalScore - a.totalScore);
      },
    });
  }

  async generateAngle(params: {
    rawTopic: string;
    keyword: string;
    rationale: string;
    blogProfile: BlogProfile;
    sourceContext?: WriterSourceContext | null;
  }): Promise<WriterGenerationResult<AngleResult>> {
    const articleIntent = classifyArticleIntent({
      rawTopic: params.rawTopic,
      keyword: params.keyword,
      rationale: params.rationale,
      sourceContext: params.sourceContext,
    });
    const isCommunityRumorWatch = articleIntent.primaryIntent === "community_rumor_watch";
    const isModelComparisonGuide = articleIntent.primaryIntent === "model_comparison_guide";
    const fallback: AngleResult = {
      angle: isModelComparisonGuide
        ? "Claude Code에서 Sonnet은 기본 작업용, Opus는 실패 비용이 큰 작업용으로 나누는 선택 기준을 정리"
        : isCommunityRumorWatch
        ? buildCommunityRumorWatchAngle(params.keyword)
        : `${params.keyword}를 ${params.blogProfile.targetAudience} 관점에서 바로 실행 가능한 단계형 가이드로 정리`,
      title: isModelComparisonGuide
        ? "Claude Code Opus Sonnet 차이: Opus 중단설 전에 볼 작업 기준"
        : isCommunityRumorWatch
        ? buildCommunityRumorWatchFallbackTitle(params.sourceContext, params.keyword)
        : `${params.keyword} 실전 가이드: 지금 적용 가능한 체크포인트`,
      reason: isModelComparisonGuide
        ? "대체 도구 비교가 아니라 Opus/Sonnet 작업 선택 기준과 공식 확인 전 체크포인트를 우선합니다."
        : isCommunityRumorWatch
        ? "커뮤니티 조기 신호를 사실로 단정하지 않고, 공식 확인 전 확인 기준과 개인적인 대응 방향을 우선합니다."
        : "블로그 타깃 독자의 실행 의도를 우선하는 방향입니다.",
      titleCandidates: isModelComparisonGuide
        ? [
            "Claude Code Opus Sonnet 차이: Opus 중단설 전에 볼 작업 기준",
            "Claude Code에서 Opus와 Sonnet을 나눠 쓰는 기준",
            "Claude Code Opus 중단설 전에 확인할 Sonnet 선택 기준",
          ]
        : isCommunityRumorWatch
        ? communityRumorWatchTitleExamples
        : [
            `${params.keyword} 실전 가이드`,
            `${params.keyword} 적용 체크리스트`,
            `${params.keyword} 바로 쓰는 방법`,
          ],
    };

    return this.withLog({
      action: "generateAngle",
      inputSummary: `topic=${params.rawTopic}, keyword=${params.keyword}`,
      outputSummary: (result) => `${result.title} / ${result.angle}`,
      onErrorFallback: () => fallback,
      runner: async () => {
        const response = await this.complete({
          responseFormat: "json",
          messages: [
            {
              role: "system",
              content:
                [
                  "Return only JSON with fields angle, title, reason, titleCandidates(3).",
                  "If this is based on community-only signals, use review-style titles such as 중단설, 공식 확인 전, 확인해야 할 점, and do not assert the signal as fact.",
                  "If official sources are confirmed, distinguish official-source facts from community reactions.",
                  "If contradicted or rejected_as_rumor, frame only as rumor verification failure.",
                  ...(isCommunityRumorWatch
                    ? [
                        "For community_rumor_watch mode, keep the title centered on the rumor/checkpoint itself, not alternative-tool comparison.",
                        "Prefer titles like Claude Code Opus 제공 중단설, 지금 확인해야 할 것들.",
                        "Avoid making 대체 도구 the title's main frame.",
                      ]
                    : []),
                  ...(isModelComparisonGuide
                    ? [
                        "For model_comparison_guide mode, the title must include Claude Code, Opus, Sonnet, and 차이 or 선택 기준.",
                        "The title center must be Opus/Sonnet task selection, with Opus 중단설 only as a safety/check context.",
                        "Avoid internal implementation or automation framing.",
                      ]
                    : []),
                ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify({
                rawTopic: params.rawTopic,
                keyword: params.keyword,
                rationale: params.rationale,
                sourceContext: params.sourceContext,
                blogProfile: {
                  targetAudience: params.blogProfile.targetAudience,
                  defaultTone: params.blogProfile.defaultTone,
                  preferredStructure: params.blogProfile.preferredStructure,
                },
                articleIntent,
                writingMode: articleIntent.primaryIntent,
                titleGuidance: isModelComparisonGuide
                  ? [
                      "Claude Code Opus Sonnet 차이: Opus 중단설 전에 볼 작업 기준",
                      "Claude Code에서 Opus와 Sonnet을 나눠 쓰는 기준",
                      "Claude Code Opus 중단설 전에 확인할 Sonnet 선택 기준",
                    ]
                  : isCommunityRumorWatch
                    ? communityRumorWatchTitleExamples
                    : undefined,
              }),
            },
          ],
        });

        const parsed = safeJsonParse<Partial<AngleResult>>(response, fallback);
        return {
          angle: parsed.angle?.trim() || fallback.angle,
          title: parsed.title?.trim() || fallback.title,
          reason: parsed.reason?.trim() || fallback.reason,
          titleCandidates:
            parsed.titleCandidates?.map((item) => item.trim()).filter(Boolean).slice(0, 3) ??
            fallback.titleCandidates,
        };
      },
    });
  }

  async generateOutline(params: {
    post: Pick<Post, "id" | "title" | "angle">;
    rawTopic: string;
    keyword: string;
    blogProfile: BlogProfile;
    sourceContext?: WriterSourceContext | null;
  }): Promise<WriterGenerationResult<OutlineResult>> {
    const articleIntent = classifyArticleIntent({
      rawTopic: params.rawTopic,
      keyword: params.keyword,
      title: params.post.title,
      angle: params.post.angle,
      sourceContext: params.sourceContext,
    });
    const isCommunityRumorWatch = articleIntent.primaryIntent === "community_rumor_watch";
    const isModelComparisonGuide = articleIntent.primaryIntent === "model_comparison_guide";
    const fallback: OutlineResult = {
      title: params.post.title,
      outline: isModelComparisonGuide
        ? [
            "## 결론: Sonnet은 기본 작업, Opus는 실패 비용이 큰 작업",
            "- 왜 필요한가: 독자가 먼저 선택 기준을 잡고 세부 설명을 읽게 한다.",
            "## 먼저 확인할 사실: Opus 전체 중단인지, 특정 모델 ID 퇴역인지",
            "- 왜 필요한가: 중단설을 사실로 단정하지 않고 확인 대상을 분리한다.",
            "## Claude Code에서 Opus와 Sonnet의 실제 차이",
            "- 왜 필요한가: 모델 차이를 체감 작업 기준으로 설명한다.",
            "## 작업별 추천 기준",
            "- 왜 필요한가: 독자가 자기 작업을 기준으로 모델을 고를 수 있어야 한다.",
            "## Opus 중단설 전에 확인할 체크리스트",
            "- 왜 필요한가: 공식 확인 전 계정/플랜/모델 선택 화면을 점검하게 한다.",
            "## 추천 워크플로우",
            "- 왜 필요한가: Sonnet 기본, Opus 제한 사용이라는 운영 기준을 제시한다.",
            "## 결론",
            "- 왜 필요한가: 중단 확정이 아니라 확인 필요한 신호라는 태도를 유지한다.",
          ].join("\n")
        : isCommunityRumorWatch
        ? [
            "## Claude Code Opus 중단설이 왜 나온 걸까",
            "- 왜 필요한가: 커뮤니티 조기 신호와 공식 발표를 먼저 분리해야 한다.",
            "## 아직 확정이라고 보기 어려운 이유",
            "- 왜 필요한가: 공식 문서/릴리즈/상태 페이지 부재를 확인 포인트로 남겨야 한다.",
            "## 그래도 사용자는 무엇을 확인해야 하나",
            "- 왜 필요한가: 독자가 자기 계정과 환경에서 직접 점검할 항목이 필요하다.",
            "## 개인적으로 보는 대응 방향",
            "- 왜 필요한가: 루머를 믿거나 무시하는 대신 현실적인 대비 기준을 제시한다.",
            "## 마무리",
            "- 왜 필요한가: 중단 확정이 아니라 확인 필요한 신호로 정리한다.",
          ].join("\n")
        : [
            "## 문제 정의",
            "- 독자가 현재 겪는 문제를 2~3문장으로 요약",
            "## 핵심 개념",
            "- 개념 3개 이내로 정리",
            "## 실행 단계",
            "1. 준비",
            "2. 설정",
            "3. 검증",
            "## 실패 패턴과 대응",
            "- 자주 발생하는 실수 3가지",
            "## 체크리스트",
            "- 적용 전/후 점검 항목",
          ].join("\n"),
    };

    return this.withLog({
      action: "generateOutline",
      inputSummary: `post=${params.post.id}, keyword=${params.keyword}`,
      outputSummary: (result) => summarize(result.outline, 120),
      onErrorFallback: () => fallback,
      runner: async () => {
        const response = await this.complete({
          messages: [
            {
              role: "system",
              content:
                [
                  "You are a senior blog planner for a local personal blog-writing tool.",
                  "Return markdown outline only.",
                  "Use H2/H3 and numbered steps, but avoid generic textbook sections.",
                  "Fix one clear central angle before the outline.",
                  "Each section must include one short line explaining why that section is necessary.",
                  ...(isCommunityRumorWatch
                    ? [
                        "This is community_rumor_watch mode.",
                        "Plan the article as 루머/떡밥 감지 → 근거 확인 → 개인적 판단 → 대응 기준.",
                        `Use this structure: ${communityRumorWatchStructure.join(" / ")}.`,
                        `Do not plan sections about these internal implementation terms: ${communityRumorWatchInternalTerms.join(", ")}.`,
                        "Do not turn this into a Codex/ChatGPT/Gemini CLI replacement comparison or blog automation design article.",
                      ]
                    : [
                        "Reflect the user's actual project context when relevant: provider success E2E, oauth-proxy, WriterService, TrendCandidate, scoring v2, fallback, GenerationLog, approval guard.",
                      ]),
                  ...(isModelComparisonGuide
                    ? [
                        "This is model_comparison_guide mode.",
                        "Plan the article around Opus/Sonnet task selection, not internal project implementation.",
                        "Use the required seven-section structure: conclusion first, facts to confirm, Opus/Sonnet differences, task criteria, rumor checklist, workflow, conclusion.",
                        "If rumor_safety_overlay is present, require 확인 필요 for unverified shutdown or model availability claims.",
                        `Do not plan sections about these internal implementation terms: ${publicArticleForbiddenTerms.join(", ")}.`,
                      ]
                    : []),
                  "If external trend/search/news/community data is missing, mark the related score or trend claim as estimated.",
                  "If sourceContext is community_only, plan the article as a community early-signal check and require official confirmation before factual claims.",
                  "If sourceContext.reinforcementSignals includes GitHub Issues, treat them only as needs_manual_review reinforcement signals, not official confirmation.",
                  "If sourceContext has official_confirmed sources, separate official-source facts from community reactions.",
                  "If sourceContext is contradicted or rejected_as_rumor, plan only a rumor verification failure or discard-style article, not a factual update.",
                  "Do not plan automatic publishing as the main workflow; separate writing automation from publishing automation.",
                  "Reduce AI-written feel: avoid overly polished summaries, repetitive conclusions, promotional phrasing, and broad openings.",
                  "Plan concrete friction points, blocked moments, changed judgments, exceptions, and conditional branches.",
                  "Distinguish direct experience from external opinions. Use direct-experience sections only when the user's provided context supports them.",
                  "External user opinions may only be used when actual source material is provided in the input and directly supports the article. Do not invent or list source names.",
                  "When external opinion sources are missing, omit external-opinion sections from the reader-facing outline. Do not plan a 'no user opinion' disclaimer.",
                ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify({
                title: params.post.title,
                angle: params.post.angle,
                rawTopic: params.rawTopic,
                keyword: params.keyword,
                sourceContext: params.sourceContext,
                rules: {
                  structure: params.blogProfile.preferredStructure,
                  seo: params.blogProfile.seoRules,
                  html: params.blogProfile.htmlRules,
                  tooltip: params.blogProfile.tooltipRules,
                },
                outlineRequirements: {
                  centralAngleExamples: [
                    ...(isCommunityRumorWatch
                      ? [
                          "Claude Code Opus 중단설은 확정 뉴스가 아니라 확인 필요한 커뮤니티 조기 신호다",
                          "GitHub Issues는 보강 신호이지 공식 발표가 아니다",
                          "바로 갈아타기보다 자기 계정과 공식 문서 확인 기준을 먼저 세운다",
                        ]
                      : isModelComparisonGuide
                        ? [
                            "Sonnet은 기본 작업용, Opus는 실패 비용이 큰 작업용이다",
                            "Opus 중단설 전에는 전체 중단인지 특정 모델 ID 퇴역인지 확인한다",
                            "Claude Code 모델 선택은 작업 난도와 실패 비용 기준으로 나눈다",
                          ]
                      : [
                          "자동 작성기에서 어려운 건 글쓰기보다 글감 선별이다",
                          "구독형 GPT를 자동화하려면 로컬 도구와 공개 서비스 기준을 분리해야 한다",
                          "자동 발행보다 먼저 검수 가능한 초안 품질이 중요하다",
                        ]),
                  ],
                  avoid: [
                    "too generic AI introduction",
                    "standard 문제 정의/핵심 개념/실행 단계 only without project-specific sections",
                    "claims about trend/search volume without saying estimated when external data is unavailable",
                    ...(isCommunityRumorWatch
                      ? [
                          "alternative-tool comparison as the main article frame",
                          "internal implementation terms such as WriterService, GenerationLog, API route, provider success E2E",
                          "if/then style English conditional sentences in normal prose",
                        ]
                      : isModelComparisonGuide
                        ? [
                            "internal implementation terms such as WriterService, GenerationLog, API route, provider success E2E",
                            "alternative-tool comparison as the main article frame",
                            "if/then style English conditional sentences in normal prose",
                          ]
                      : []),
                  ],
                  mustIncludeWhenRelevant: isCommunityRumorWatch
                    ? [
                        "DCInside/community signal as an early signal, not fact",
                        "GitHub Issues as reinforcement only, not official confirmation",
                        "official documentation/release/status page check points",
                        "account, region, plan, and model selector differences",
                        "personal judgment and realistic response criteria",
                      ]
                    : isModelComparisonGuide
                      ? [
                          "Sonnet as default work model",
                          "Opus as high failure-cost work model",
                          "official source check for Opus shutdown rumor",
                          "Claude Code model selector, plan guide, release notes, status page",
                          "GitHub Issues as reinforcement only, not official confirmation",
                        ]
                    : [
                        "DB/API/provider 구조",
                        "server-only model call path",
                        "fallback and generationStatus distinction",
                        "approval guard before approved",
                        "GenerationLog audit trail",
                        "direct experience vs external user opinion distinction",
                        "source-backed user opinion categories when sources are provided",
                      ],
                  userOpinionRules: [
                    "Use external opinions only when actual source material is provided and directly used as evidence.",
                    "If no source material is provided, omit external-opinion sections from the reader-facing outline.",
                    "Classify sourced opinions as common complaint, common strength, divided opinion, beginner confusion, or operational issue.",
                    "Do not fabricate quotes, comments, review summaries, community consensus, or source lists.",
                  ],
                },
              }),
            },
          ],
        });

        return {
          title: params.post.title,
          outline: response?.trim() || fallback.outline,
        };
      },
    });
  }

  async generateDraft(params: {
    post: Pick<Post, "id" | "title" | "angle" | "outline">;
    rawTopic: string;
    keyword: string;
    blogProfile: BlogProfile;
    sourceContext?: WriterSourceContext | null;
  }): Promise<WriterGenerationResult<DraftResult>> {
    const articleIntent = classifyArticleIntent({
      rawTopic: params.rawTopic,
      keyword: params.keyword,
      title: params.post.title,
      angle: params.post.angle,
      sourceContext: params.sourceContext,
    });
    const isCommunityRumorWatch = articleIntent.primaryIntent === "community_rumor_watch";
    const isModelComparisonGuide = articleIntent.primaryIntent === "model_comparison_guide";
    const fallbackDraft = [
      `# ${params.post.title}`,
      "",
      ...(isModelComparisonGuide
        ? [
            "## 결론: Sonnet은 기본 작업, Opus는 실패 비용이 큰 작업",
            "Claude Code에서 Sonnet은 기본 코딩 작업과 반복 수정에 두고, Opus는 실패 비용이 큰 설계 검토와 난도 높은 디버깅에 제한적으로 쓰는 편이 현실적입니다.",
            "",
            "## 먼저 확인할 사실: Opus 전체 중단인지, 특정 모델 ID 퇴역인지",
            "아직 공식 확인 전이라면 중단 확정이 아니라 확인 필요한 신호로 봐야 합니다.",
            "",
            "## 작업별 추천 기준",
            "- 일반 수정과 반복 작업: Sonnet",
            "- 큰 설계 변경과 실패 비용이 큰 판단: Opus",
            "",
            "## 마무리",
            "지금은 Opus 중단 확정이 아니라 확인 필요한 신호입니다. 공식 출처와 내 계정의 모델 선택 화면을 함께 확인하는 편이 낫습니다.",
          ]
        : isCommunityRumorWatch
        ? [
            "## Claude Code Opus 중단설이 왜 나온 걸까",
            "커뮤니티에서 나온 이야기를 먼저 조기 신호로 분리해 봅니다. 아직 공식 확인 전이므로 확정 사실처럼 다루지 않습니다.",
            "",
            "## 아직 확정이라고 보기 어려운 이유",
            "공식 문서, 공식 블로그, 릴리즈 노트, 상태 페이지에서 같은 내용이 확인되기 전까지는 중단설로 두는 편이 안전합니다.",
            "",
            "## 그래도 사용자는 무엇을 확인해야 하나",
            "- Claude Code 모델 선택 화면",
            "- Claude Pro 요금제 안내",
            "- Anthropic 공식 changelog",
            "- 관련 GitHub Issues",
            "",
            "## 개인적으로 보는 대응 방향",
            "개인적으로는 바로 갈아타기보다 중요한 작업에서 쓸 보완 후보와 확인 루틴을 먼저 점검할 타이밍으로 봅니다.",
          ]
        : [
            "## 문제 정의",
            `${params.rawTopic}를 다룰 때 실무에서 가장 자주 막히는 지점을 먼저 정리합니다.`,
          ]),
      "",
      ...(isCommunityRumorWatch
        ? [
            "## 마무리",
            "지금은 중단 확정이 아니라 확인 필요한 신호입니다. 사용하는 사람은 자기 계정과 공식 출처를 직접 확인하는 편이 낫습니다.",
          ]
        : [
            "## 핵심 개념",
            "- 핵심 개념 A",
            "- 핵심 개념 B",
            "",
            "## 실행 단계",
            "1. 현재 상태 점검",
            "2. 최소 설정으로 시작",
            "3. 측정 지표로 검증",
            "",
            "## 체크리스트",
            "- 오늘 바로 적용할 3가지",
          ]),
    ].join("\n");

    return this.withLog({
      action: "generateDraft",
      inputSummary: `post=${params.post.id}, keyword=${params.keyword}`,
      outputSummary: (result) => summarize(result.draft, 140),
      onErrorFallback: () => ({ draft: fallbackDraft }),
      runner: async () => {
        const draftQualityRequirements = isCommunityRumorWatch
          ? buildCommunityRumorWatchDraftRequirements(params.sourceContext)
          : buildStandardDraftRequirements();
        const optionalSectionsWhenSupported = isCommunityRumorWatch
          ? [
              "커뮤니티에서 어떤 말이 돌고 있는지",
              "아직 확정이라고 보기 어려운 이유",
              "사용자가 직접 확인해야 할 것",
              "개인적으로 보는 대응 방향",
              "추천하는 대응",
              "추천하지 않는 대응",
            ]
          : [
              "내가 겪은 문제",
              "출처가 제공된 사용자 불편함",
              "출처가 제공된 의견 갈림",
              "내 환경에서의 판단",
              "추천하는 경우",
              "추천하지 않는 경우",
            ];
        if (isCommunityRumorWatch) {
          return {
            draft: await this.generateCommunityRumorWatchDraft({
              post: params.post,
              rawTopic: params.rawTopic,
              keyword: params.keyword,
              blogProfile: params.blogProfile,
              sourceContext: params.sourceContext,
              fallbackDraft,
            }),
          };
        }
        if (isModelComparisonGuide) {
          return {
            draft: await this.generateModelComparisonGuideDraft({
              post: params.post,
              rawTopic: params.rawTopic,
              keyword: params.keyword,
              blogProfile: params.blogProfile,
              sourceContext: params.sourceContext,
              articleIntent,
              fallbackDraft,
            }),
          };
        }
        const response = await this.complete({
          temperature: 0.4,
          messages: [
            {
              role: "system",
              content:
                [
                  isCommunityRumorWatch
                    ? "You are a Korean blog writer covering AI/developer-tool community rumors with cautious personal judgment."
                    : "You are a technical blog writer for practical local-tool articles.",
                  "Return markdown article draft only.",
                  "Recommended body length is 6,000-9,000 Korean characters. Do not exceed this range unless the outline absolutely requires it.",
                  "Use at most 6-7 H2 sections. Use H3 only when it prevents confusion.",
                  "Use at most 2 code blocks, at most 2 tables, at most 3 failure cases, and at most 4 grouped conditional decision rules.",
                  "Deeply judge the important tradeoffs, but do not write long. Select only the important conditions and exceptions.",
                  "Do not repeat the same conclusion across sections.",
                  "Prioritize the reader's selection criteria over internal implementation details.",
                  "The final output must read like a blog article, not a full implementation design document.",
                  "Do not start with broad claims like 'AI is important' or 'automation is efficient'.",
                  "Start from the reader's concrete decision, failure, or implementation situation.",
                  "Keep the tone realistic: no hype, no unconditional recommendations, prefer tradeoffs and 'possible, but only if...' judgments.",
                  "Reduce AI-written feel: avoid overly polished summaries, repeated neat conclusions, and promotional wording.",
                  "Write as if a careful operator is explaining real friction: blocked points, changed judgment, uncertainty, exceptions, and conditional decisions.",
                  ...(isCommunityRumorWatch
                    ? [
                        "This is community_rumor_watch mode.",
                        "Write in the flow 루머/떡밥 감지 → 근거 확인 → 개인적 판단 → 대응 기준.",
                        `Use these sections as the backbone: ${communityRumorWatchStructure.join(" / ")}.`,
                        "Focus on the Claude Code Opus availability rumor and what readers should verify.",
                        "Do not turn the article into a Codex/ChatGPT/Gemini CLI replacement comparison. Mention alternatives only briefly as fallback or backup candidates when necessary.",
                        `Do not include these internal implementation terms unless the article topic is the blog automation app itself: ${communityRumorWatchInternalTerms.join(", ")}.`,
                        "Do not discuss blog automation architecture, publishing automation, Tistory export, provider structure, API routes, or internal test logs in this article.",
                        "Do not use English if/then conditional sentences in normal prose. Use natural Korean condition sentences instead.",
                        "Include concrete verification examples such as model selector, plan guide, official documentation, official changelog, status page, and relevant GitHub Issues.",
                        "Include a personal judgment section. Do not fabricate direct experience; phrase it as judgment or operating principle when direct testing was not provided.",
                        "End with a personal but cautious conclusion: this is not confirmed shutdown, it is a signal worth checking in one's own account and official sources.",
                      ]
                    : [
                        "Include at least 3 concrete examples, such as DB model, API route, provider choice, failure case, review condition, or an operator button/workflow.",
                        "Include at least 3 conditional decision rules in the form 'if A, then B; if C, then D'.",
                        "Include at least 2 failure cases and what should prevent or detect them.",
                      ]),
                  "Mark claims requiring current evidence as '확인 필요', '추정', or '현재 구현 기준'. This applies to latest information, prices, policies, product features, search volume, trends, and security claims.",
                  "Do not invent source links when no external search data is provided.",
                  "If sourceContext contains only community signals, write '커뮤니티에서 이런 이야기가 나왔다', '공식 확인 필요', or equivalent review-style language. Do not state launches, shutdowns, pricing, policy, or availability as confirmed.",
                  "If sourceContext.reinforcementSignals includes GitHub Issues, include one conservative sentence that similar discussion appears in GitHub issues, but never write that it is officially confirmed.",
                  "If sourceContext includes official_confirmed sources, describe confirmed points as official-source-based and keep community reactions separate.",
                  "If sourceContext is contradicted or rejected_as_rumor, do not use the claim as fact. Only discuss it as a rumor verification failure or a case study in source checking.",
                  "When official source URLs are provided, mention that the official source should be checked, but do not paste long source text or invent details beyond title, URL, and note.",
                  "Do not invent user comments, reviews, source names, or community consensus.",
                  "Use direct-experience wording such as '내 환경에서는', '이번 테스트에서는', or '직접 해보니' only when that experience is provided in the input context.",
                  "Use external-opinion wording such as '다른 사용자들은', '커뮤니티에서는', or '실제 후기에서는' only when actual source material is provided and directly supports the article's argument.",
                  "If no sourced user opinions are provided, silently omit user-opinion sections. Do not write defensive notices such as '사용자 의견이 없다', '외부 사용자 의견은 다루지 않는다', or lists of unavailable external opinion sources.",
                  "Do not explain BlogProfile forbidden rules, review rules, or safety rules in the reader-facing article body.",
                  "Do not list external opinion sources unless they are actually provided and used as evidence.",
                  "Mention user opinions only when they are central to the topic. Otherwise write only topic-relevant judgment, examples, and check principles.",
                  "When sourced opinions are available, summarize or paraphrase them and classify them as common complaints, common strengths, divided opinions, beginner confusion, or operational issues.",
                  ...(isCommunityRumorWatch
                    ? []
                    : [
                        "Always distinguish writing automation MVP from publishing automation; treat automatic publishing as a later, separate concern.",
                      ]),
                  "Avoid generic AI introductions and generic productivity claims unless tied to a concrete implementation detail.",
                  ...(isCommunityRumorWatch
                    ? []
                    : [
                        "Limit internal project terms. Explain them briefly in plain language before using them: WriterService means 초안 생성 서비스, GenerationLog means 생성 로그, approval guard means 승인 차단 로직, scoring v2 means 글감 점수 계산 규칙, oauth-proxy means 로컬 인증 프록시, provider success E2E means provider 연결 검증 테스트.",
                        "Use internal project terms only as REFUSE HUB implementation examples. Do not overload headings, tags, or titles with them.",
                        "Code examples must be short pseudocode for explaining structure, not copy-paste full implementations.",
                        "When including pseudocode, add a caution that authentication, authorization, input validation, and exception handling must be adapted to the real project.",
                      ]),
                  "Optionally include user-opinion sections only when actual source material is provided and central to the article.",
                  "End with a practical personal judgment, operating principle, or checklist rather than a safety disclaimer.",
                ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify({
                title: params.post.title,
                angle: params.post.angle,
                rawTopic: params.rawTopic,
                keyword: params.keyword,
                outline: params.post.outline,
                sourceContext: params.sourceContext,
                profile: {
                  tone: params.blogProfile.defaultTone,
                  targetAudience: params.blogProfile.targetAudience,
                  forbiddenPhrases: params.blogProfile.forbiddenPhrases,
                  seoRules: params.blogProfile.seoRules,
                  htmlRules: params.blogProfile.htmlRules,
                  tooltipRules: params.blogProfile.tooltipRules,
                },
                draftQualityRequirements,
                  userOpinionRules: [
                    "Do not create fake user reviews or fake comments.",
                    "Do not present unsourced opinions as real community reactions.",
                    "Do not write unprovided experience as the author's direct experience.",
                    "Separate author judgment from external user opinion in wording.",
                    "If using direct quotes from real sources supplied by the user, keep them short and prefer paraphrase.",
                    "If no sourced user opinions are provided, do not mention the absence of user opinions.",
                    "Do not list unavailable source names, community names, forum names, app-review sources, or comment sources.",
                    "Do not turn BlogProfile validation rules into reader-facing prose.",
                    "User-opinion material should appear only when it directly supports the article.",
                  ],
                  optionalSectionsWhenSupported,
                }
              ),
            },
          ],
        });

        const draft = response?.trim() || fallbackDraft;
        const violations = findPublicArticleDraftViolations(draft, articleIntent);

        if (violations.length === 0) {
          return { draft };
        }

        const rewritten = await this.complete({
          temperature: 0.1,
          messages: [
            {
              role: "system",
              content:
                "Rewrite the public blog draft in Korean. Remove internal implementation details and English if/then prose. Return markdown article body only.",
            },
            {
              role: "user",
              content: JSON.stringify({
                articleIntent,
                violations,
                draft,
              }),
            },
          ],
        });
        const rewrittenDraft = rewritten?.trim() || fallbackDraft;
        const rewrittenViolations = findPublicArticleDraftViolations(rewrittenDraft, articleIntent);

        return {
          draft: rewrittenViolations.length === 0 ? rewrittenDraft : fallbackDraft,
        };
      },
    });
  }

  async reviewDraft(params: {
    post: Pick<Post, "id" | "title" | "draft">;
    blogProfile: BlogProfile;
    sourceContext?: WriterSourceContext | null;
  }): Promise<WriterGenerationResult<ReviewResult>> {
    const articleIntent = classifyArticleIntent({
      title: params.post.title,
      memo: params.post.draft,
      sourceContext: params.sourceContext,
    });
    const isCommunityRumorWatch = articleIntent.primaryIntent === "community_rumor_watch";
    const isModelComparisonGuide = articleIntent.primaryIntent === "model_comparison_guide";
    const fallback = [
      "## 검수 요약",
      "- 구조: 통과",
      "- 톤: 부분 수정 필요",
      "- 사실 리스크: 외부 근거 링크 추가 권장",
      "",
      "## 수정 권장",
      "1. 서론에서 독자 문제를 더 구체화",
      "2. 실행 단계에 실패 조건과 예외 추가",
      "3. 결론에 행동 체크리스트 보강",
    ].join("\n");

    return this.withLog({
      action: "reviewDraft",
      inputSummary: `post=${params.post.id}, title=${params.post.title}`,
      outputSummary: (result) => summarize(result.reviewReport, 140),
      onErrorFallback: () => ({ reviewReport: fallback }),
      runner: async () => {
        const response = await this.complete({
          messages: [
            {
              role: "system",
              content:
                [
                  "You are a strict technical blog editor.",
                  "Return a markdown review report only.",
                  "The report must include exactly these top-level sections: 발행 판단, 수정 우선순위, 사실 확인 필요 문장, 과장/일반론 문장, 구체 수정 제안, 내부링크 아이디어, SEO 개선.",
                  "In 발행 판단, choose exactly one of: 바로 발행 가능, 수정 후 발행 가능, 보류. Explain why.",
                  "In 수정 우선순위, group findings into P0, P1, P2 using strict severity.",
                  "P0 is only for issues that must be fixed before publishing: likely factual errors, unsupported claims about latest policy/pricing/API/security, core errors that change the conclusion, or content that could mislead readers into a wrong action.",
                  "P1 is for quality improvements: overly generic claims, paragraphs lacking concrete examples, awkward flow, mild SEO/search-intent mismatch, or technical explanations that need clearer wording.",
                  "P2 is for polish: expression cleanup, sentence rhythm, internal-link ideas, tag additions, image/table/diagram ideas.",
                  "P0 may be empty. Do not put style improvements, example additions, or nice-to-have details into P0.",
                  "Treat implementation-dependent caveats or wording that could be more precise as P1 unless the draft makes a concrete false, unsafe, or reader-misleading claim.",
                  "In 사실 확인 필요 문장, isolate claims about latest information, policy, pricing, API behavior, security, trend/search volume, or external data.",
                  "In 과장/일반론 문장, call out vague or unsupported benefit claims.",
                  "In 구체 수정 제안, provide a rewrite direction or replacement sentence for each important issue.",
                  "In 내부링크 아이디어, suggest 3 related article topics only. Do not invent URLs.",
                  "In SEO 개선, include title suggestion, meta description suggestion, tag suggestion, and any search intent mismatch.",
                  "Also check whether writing automation and automatic publishing are clearly separated.",
                  "Check whether the draft sounds AI-written: broad openings, overly neat summaries, repetitive conclusions, vague benefits, or promotional claims.",
                  "Check whether direct experience and external user opinions are clearly separated.",
                  "Flag any sentence that presents unprovided experience as the author's direct experience.",
                  "Flag unsourced claims such as 'many users', 'most people', 'the community says', or 'actual reviews say' unless source material is present in the draft.",
                  "Flag fake-looking quotes, comments, reviews, or community reactions.",
                  "Flag defensive disclaimers such as '사용자 의견 없음', '외부 사용자 의견은 다루지 않습니다', or source lists inserted only to satisfy internal rules.",
                  "Flag sections that list external opinion sources but do not use them as evidence.",
                  "Flag unnecessary safety notices that fill the ending instead of a topic-relevant judgment or check principle.",
                  ...(isCommunityRumorWatch
                    ? [
                        "For community_rumor_watch drafts, check that the article stays on the rumor/checkpoint topic and does not drift into internal implementation, blog automation architecture, or alternative-tool comparison.",
                        `Flag unnecessary internal implementation terms: ${communityRumorWatchInternalTerms.join(", ")}.`,
                        "Flag English if/then conditional sentences in normal prose.",
                        "Check that GitHub Issues are described only as reinforcement signals, not official announcements.",
                        "Check that the ending includes personal judgment or operating principle, not only a defensive disclaimer.",
                      ]
                    : []),
                  ...(isModelComparisonGuide
                    ? [
                        "For model_comparison_guide drafts, check that the article leads with the conclusion Sonnet은 기본 작업용, Opus는 실패 비용이 큰 작업용.",
                        "Check that the draft stays centered on Opus/Sonnet selection criteria and does not drift into internal implementation or automation architecture.",
                        "Check that Opus shutdown rumor is treated as 확인 필요 unless official sources are provided.",
                        `Flag unnecessary internal implementation terms: ${publicArticleForbiddenTerms.join(", ")}.`,
                        "Flag English if/then conditional sentences in normal prose.",
                      ]
                    : []),
                  "Check whether community_only content is written like confirmed fact.",
                  "Check whether launches, shutdowns, pricing, policy, or API behavior are asserted without official_confirmed status.",
                  "If official source URLs exist, check whether the draft mentions official-source verification instead of relying only on community signals.",
                  "If GitHub Issues reinforcement signals exist, check that they are written as needs_manual_review support, not official confirmation.",
                  "If sourceContext is contradicted or rejected_as_rumor, flag any sentence that treats the original claim as factual.",
                ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify({
                title: params.post.title,
                draft: params.post.draft,
                sourceContext: params.sourceContext,
                rules: {
                  tone: params.blogProfile.defaultTone,
                  forbiddenPhrases: params.blogProfile.forbiddenPhrases,
                  seoRules: params.blogProfile.seoRules,
                  htmlRules: params.blogProfile.htmlRules,
                  tooltipRules: params.blogProfile.tooltipRules,
                },
                reviewCriteria: {
                  mustFlag: [
                    "unsupported productivity or SEO benefit claims",
                    "current API/product/pricing/security claims without 확인 필요",
                    "missing concrete examples",
                    "missing conditional decision rules",
                    "missing failure cases",
                    "automatic publishing treated as part of MVP",
                    "AI-written generic opening or overly polished summary",
                    "direct experience claimed without input support",
                    "unsourced user/community opinion",
                    "external opinion and author judgment not separated",
                    "defensive no-user-opinion disclaimer interrupting article flow",
                    "unused list of external opinion sources",
                    "unnecessary safety disclaimer ending",
                    ...(isCommunityRumorWatch
                      ? [
                          "community rumor article drifted into internal implementation or alternative-tool comparison",
                          "internal implementation terms in a community rumor article",
                          "English if/then conditional sentences in normal prose",
                          "GitHub Issues treated as official announcement",
                          "missing personal judgment in the ending",
                        ]
                      : []),
                    ...(isModelComparisonGuide
                      ? [
                          "model comparison article missing the Sonnet default / Opus high failure-cost conclusion",
                          "model comparison article drifted into internal implementation or automation architecture",
                          "Opus rumor treated as confirmed without official source",
                          "English if/then conditional sentences in normal prose",
                        ]
                      : []),
                  ],
                  priorityRules: {
                    P0: [
                      "likely factual error",
                      "unsupported latest policy/pricing/API/security claim",
                      "core error that changes the article conclusion",
                      "content that could mislead readers into a wrong implementation or operating decision",
                    ],
                    P1: [
                      "generic sentence",
                      "paragraph lacking concrete examples",
                      "awkward flow",
                      "minor SEO or search intent mismatch",
                      "technical explanation that would benefit from clearer wording",
                    ],
                    P2: [
                      "expression polishing",
                      "sentence rhythm",
                      "internal link idea",
                      "tag improvement",
                      "image/table/diagram idea",
                    ],
                    severityGuidance:
                      "P0 can be empty. Put style, example-depth, wording precision, and implementation-dependent caveats in P1 or P2 unless they create a likely factual/security/API error or wrong action.",
                  },
                  internalLinkTopicExamples: [
                    "Provider 연결 실패를 fallback과 구분하는 방법",
                    "TrendCandidate scoring v2 설계 기준",
                    "승인 전 reviewReport를 강제하는 approval guard",
                  ],
                },
              }),
            },
          ],
        });

        return {
          reviewReport: response?.trim() || fallback,
        };
      },
    });
  }

  async rewriteDraft(params: {
    post: Pick<Post, "id" | "title" | "draft">;
    rewriteInstruction: string;
    blogProfile: BlogProfile;
  }): Promise<WriterGenerationResult<DraftResult>> {
    return this.withLog({
      action: "rewriteDraft",
      inputSummary: `post=${params.post.id}, instruction=${params.rewriteInstruction}`,
      outputSummary: (result) => summarize(result.draft, 120),
      onErrorFallback: () => ({ draft: params.post.draft || "" }),
      runner: async () => {
        const response = await this.complete({
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content: "Rewrite the blog draft and return markdown only.",
            },
            {
              role: "user",
              content: JSON.stringify({
                title: params.post.title,
                draft: params.post.draft,
                instruction: params.rewriteInstruction,
                tone: params.blogProfile.defaultTone,
                forbiddenPhrases: params.blogProfile.forbiddenPhrases,
              }),
            },
          ],
        });

        return {
          draft: response?.trim() || params.post.draft || "",
        };
      },
    });
  }

  async generateSeoPackage(params: {
    post: Pick<Post, "id" | "title" | "draft">;
    keyword: string;
    sourceContext?: WriterSourceContext | null;
  }): Promise<WriterGenerationResult<SeoPackageResult>> {
    const articleIntent = classifyArticleIntent({
      keyword: params.keyword,
      title: params.post.title,
      memo: params.post.draft,
      sourceContext: params.sourceContext,
    });
    const isCommunityRumorWatch = articleIntent.primaryIntent === "community_rumor_watch";
    const isModelComparisonGuide = articleIntent.primaryIntent === "model_comparison_guide";
    const fallback = {
      metaTitle: isModelComparisonGuide
        ? "Claude Code Opus Sonnet 차이: 모델 선택 기준"
        : isCommunityRumorWatch
        ? buildCommunityRumorWatchFallbackTitle(params.sourceContext, params.keyword)
        : `${params.keyword} 실전 가이드`,
      metaDescription: isModelComparisonGuide
        ? "Claude Code에서 Sonnet과 Opus를 작업 기준으로 나눠 쓰는 방법과 Opus 중단설 전 확인할 공식 출처·모델 선택 체크포인트를 정리합니다."
        : isCommunityRumorWatch
        ? "Claude Code Opus 제공 중단설을 공식 확인 전 검토하고, 사용자가 지금 확인할 모델 선택·요금제·공식 문서 기준을 정리합니다."
        : `${params.keyword}를 빠르게 적용하기 위한 핵심 단계와 체크리스트를 정리합니다.`,
      tags: isModelComparisonGuide
        ? modelComparisonRumorTags
        : isCommunityRumorWatch
          ? communityRumorWatchPreferredTags
          : [params.keyword, "실무", "가이드"],
      slug: params.keyword.replace(/\s+/g, "-").toLowerCase(),
    };

    return this.withLog({
      action: "generateSeoPackage",
      inputSummary: `post=${params.post.id}, keyword=${params.keyword}`,
      outputSummary: (result) => summarize(result.seoPackage, 140),
      onErrorFallback: () => ({
        seoPackage: JSON.stringify(fallback, null, 2),
      }),
      runner: async () => {
        const response = await this.complete({
          responseFormat: "json",
          messages: [
            {
              role: "system",
              content:
                [
                  "Return only JSON with keys metaTitle, metaDescription, tags(array), slug.",
                  "Avoid broad standalone tags such as AI, SEO, 자동화 unless combined with a specific qualifier.",
                  "Prefer concrete public search tags that real readers would type.",
                  "For community-signal based articles, prefer 검토형 tags such as Claude Code, Claude Pro, Opus, AI 코딩 도구, 모델 제공 중단, 개발자 요금제, AI 도구 검토 when relevant.",
                  "Do not overuse source-name tags. DCInside or 특이점갤 may appear at most once and only when useful.",
                  "Return 8-10 tags.",
                  ...(isCommunityRumorWatch
                    ? [
                        "For community_rumor_watch mode, prioritize tags that a reader would actually search for around the rumor: Claude Code, Claude Pro, Claude Opus, Opus 제공 중단설, Claude Code 이슈, AI 코딩 도구, Anthropic, 개발자 요금제, 모델 제공 정책, AI 도구 루머.",
                        "Do not use internal implementation terms, app architecture terms, or alternative-tool lists as SEO tags.",
                        "Do not use Next.js API Route, OpenAI-compatible provider, Tistory Export, WriterService, GenerationLog, provider success E2E, or similar internal terms.",
                        "Do not make Codex, ChatGPT, Gemini CLI the tag center unless the article is actually about comparing those tools.",
                      ]
                    : isModelComparisonGuide
                      ? [
                          "For model_comparison_guide with rumor_safety_overlay, prioritize tags: Claude Code, Claude Opus, Claude Sonnet, Opus Sonnet 차이, Claude Code 모델 선택, Opus 중단설, AI 코딩 도구, 코딩 에이전트, 모델 선택 기준, Anthropic.",
                          "Do not use internal implementation terms or automation tags.",
                          "Do not use WriterService, GenerationLog, approval guard, oauth-proxy, OpenAI-compatible provider, API Route, Tistory Export, provider success E2E, 자동화, or SEO.",
                        ]
                    : [
                        "Include at least 4 search-intent tags, such as 블로그 자동 작성기, ChatGPT API 활용, AI 콘텐츠 파이프라인, 티스토리 글쓰기 자동화.",
                        "Include at least 3 technical-component tags, such as Next.js API Route, Prisma SQLite, OpenAI-compatible provider, 로컬 LLM.",
                      ]),
                  "Reduce internal implementation terms in public SEO tags.",
                  "Do not use internal terms or test names such as WriterService, GenerationLog, provider success E2E, or internal test names as tags.",
                  "Avoid clickbait words such as 무조건, 완벽, 끝판왕, 충격.",
                  "The metaDescription should be 120-145 Korean characters and must never exceed 150 characters.",
                  "Do not habitually repeat phrases such as 자동 발행 전 in every article.",
                  "Summarize the article's actual core risk, check point, and reader benefit in one sentence.",
                  "For community-signal based articles, naturally include a 검토형 expression such as 공식 확인 전 체크할 점 when relevant.",
                  "If official sources are confirmed, the title and metaDescription may say official-source-based confirmation, but still avoid overclaiming.",
                  "If the source is contradicted or rejected_as_rumor, make the SEO package about verification failure or source-checking, not the original claim as fact.",
                  "Do not overpromise search ranking, traffic, cost savings, or full automation.",
                ].join(" "),
            },
            {
              role: "user",
              content: JSON.stringify({
                keyword: params.keyword,
                title: params.post.title,
                draft: params.post.draft,
                sourceContext: params.sourceContext,
                seoRequirements: {
                  articleIntent,
                  ...(isCommunityRumorWatch
                    ? buildCommunityRumorWatchSeoRequirements()
                    : isModelComparisonGuide
                      ? {
                          mode: "model_comparison_guide",
                          overlay: hasRumorSafetyOverlay(articleIntent) ? "rumor_safety_overlay" : null,
                          tagCount: "8-10",
                          preferredTags: modelComparisonRumorTags,
                          forbiddenTags: [
                            "WriterService",
                            "GenerationLog",
                            "approval guard",
                            "oauth-proxy",
                            "OpenAI-compatible provider",
                            "API Route",
                            "Tistory Export",
                            "provider success E2E",
                            "자동화",
                            "SEO",
                          ],
                          metaDescriptionLength: "120-145 Korean characters, hard maximum 150",
                        }
                    : {
                        tagCount: "8-10",
                        minimumSearchIntentTags: 4,
                        minimumTechnicalComponentTags: 3,
                        maxInternalTermTags: 2,
                        metaDescriptionLength: "120-145 Korean characters, hard maximum 150",
                        forbiddenTags: ["provider success E2E", "GenerationLog", "WriterService", "AI", "자동화", "SEO"],
                        preferSpecificTags: true,
                        reflectLimitations: true,
                        avoidClickbait: true,
                        distinguishWritingAutomationFromPublishingAutomation: true,
                        communitySignalGuidance: {
                          avoidSourceTagSpam: true,
                          maxSourceNameTags: 1,
                          useReviewStyleKeywords: true,
                        },
                      }),
                },
              }),
            },
          ],
        });

        const parsed = safeJsonParse<Record<string, unknown>>(response, fallback);
        return {
          seoPackage: JSON.stringify(
            {
              metaTitle: String(parsed.metaTitle ?? fallback.metaTitle),
              metaDescription: normalizeMetaDescription(parsed.metaDescription ?? fallback.metaDescription),
              tags: isCommunityRumorWatch
                ? normalizeCommunityRumorWatchTags(parsed.tags)
                : isModelComparisonGuide
                  ? normalizePublicArticleTags(parsed.tags, fallback.tags, articleIntent)
                : normalizeSeoTags(parsed.tags, fallback.tags),
              slug: String(parsed.slug ?? fallback.slug),
            },
            null,
            2,
          ),
        };
      },
    });
  }
}

export function getWorkflowStepLabel(step: PostWorkflowStep): string {
  switch (step) {
    case "outline":
      return "outline";
    case "draft":
      return "draft";
    case "review":
      return "review";
    case "approved":
      return "approved";
    default:
      return step;
  }
}
