import type { BlogProfile } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { createWriterProvider, getWriterRuntime } from "@/lib/writer/provider-factory";
import type { TopicIdea } from "@/lib/topic-ideas/topic-idea-types";

const publicArticleInternalTermPattern =
  /WriterService|GenerationLog|approval\s*guard|provider\s*success\s*E2E|API\s*route|DB\s*model|oauth-proxy|OpenAI-compatible\s*provider|Tistory\s*Export|TrendCandidate|sourceMetaJson|needs_manual_review|official_confirmed/i;

function summarize(text: string, max = 500) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max - 3)}...`;
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  const candidate = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return fallback;
  }
}

function fallbackIdeas(profile: BlogProfile): TopicIdea[] {
  const audience = profile.targetAudience.split("\n")[0] ?? "AI 개발 도구 사용자";
  return [
    {
      title: "Claude Code Opus Sonnet 차이: 작업별 모델 선택 기준",
      rawTopic: "Claude Code Opus Sonnet 차이",
      memo: "Claude Code에서 Sonnet과 Opus를 작업 기준으로 나눠 쓰는 방법을 정리한다. 최신 모델 제공 상태는 공식 확인 전까지 단정하지 않는다.",
      optionalKeywords: "Claude Code, Claude Opus, Claude Sonnet, Opus Sonnet 차이, 모델 선택 기준",
      avoidTopics: "Opus 중단 확정 단정, 출처 없는 루머, 내부 구현명 중심 설명",
      reason: "REFUSE HUB 독자가 실제로 모델 선택에서 흔들리는 지점과 맞습니다.",
      targetAudience: audience,
      estimatedVerdict: "review_first",
      riskLevel: "medium",
      verificationStatus: "needs_manual_review",
      suggestedAngle: "Sonnet은 기본 작업, Opus는 실패 비용이 큰 작업이라는 기준으로 정리합니다.",
      sourceHints: ["CommunitySignal", "GitHub Issues", "공식 문서 확인 필요"],
    },
    {
      title: "AI 코딩 도구를 바꿀 때 먼저 확인할 것들",
      rawTopic: "AI 코딩 도구 선택 기준",
      memo: "Claude Code, Codex, ChatGPT, Gemini CLI를 대체재가 아니라 작업별 보완 후보로 비교한다.",
      optionalKeywords: "AI 코딩 도구, Claude Code, Codex, ChatGPT, Gemini CLI",
      avoidTopics: "무조건 추천, 가격 단정, 공식 확인 없는 정책 단정",
      reason: "검색 의도와 REFUSE HUB의 실제 독자 고민이 겹칩니다.",
      targetAudience: audience,
      estimatedVerdict: "review_first",
      riskLevel: "low",
      verificationStatus: "needs_manual_review",
      suggestedAngle: "도구 이름보다 작업 단위와 복구 부담을 먼저 보는 글로 구성합니다.",
      sourceHints: ["최근 Post", "CommunitySignal"],
    },
    {
      title: "블로그 자동 작성기는 어디까지 자동화해야 할까",
      rawTopic: "블로그 자동 작성기 자동화 범위",
      memo: "자동 발행 전까지 글감 선별, 초안, 검수, Export를 어디까지 자동화할지 정리한다.",
      optionalKeywords: "블로그 자동 작성기, AI 콘텐츠 파이프라인, 검수 워크플로우, Tistory HTML",
      avoidTopics: "자동 발행 구현, 대량 글 생성, 과장된 생산성 주장",
      reason: "REFUSE HUB 개발기 카테고리로 다루기 좋은 내부 프로젝트 주제입니다.",
      targetAudience: audience,
      estimatedVerdict: "review_first",
      riskLevel: "low",
      verificationStatus: "needs_manual_review",
      suggestedAngle: "자동 발행보다 승인 전 자동 진행과 검수 품질을 먼저 다룹니다.",
      sourceHints: ["REFUSE HUB 개발기"],
    },
    {
      title: "GitHub Issues로 AI 도구 루머를 확인하는 방법",
      rawTopic: "GitHub Issues AI 도구 루머 확인",
      memo: "커뮤니티 조기 신호를 GitHub Issues로 보강할 때 공식 확인과 어떻게 구분할지 정리한다.",
      optionalKeywords: "GitHub Issues, AI 도구 루머, 공식 확인, Claude Code 이슈",
      avoidTopics: "GitHub Issue를 공식 발표처럼 단정, 댓글 원문 저장",
      reason: "Community Radar 흐름과 실제 독자 판단 기준을 연결할 수 있습니다.",
      targetAudience: audience,
      estimatedVerdict: "review_first",
      riskLevel: "medium",
      verificationStatus: "needs_manual_review",
      suggestedAngle: "GitHub Issue는 보강 신호이고 공식 발표와는 다르다는 기준을 설명합니다.",
      sourceHints: ["GitHub Issues", "CommunitySignal"],
    },
    {
      title: "AI 글쓰기에서 검수 리포트가 먼저 필요한 이유",
      rawTopic: "AI 초안 검수 리포트",
      memo: "AI 초안을 바로 발행하지 않고 검수 리포트와 SEO 패키지를 거치는 이유를 정리한다.",
      optionalKeywords: "AI 글쓰기, 검수 리포트, SEO 패키지, 블로그 초안",
      avoidTopics: "자동 발행, 무검수 발행, 가짜 사용자 후기",
      reason: "REFUSE HUB의 승인형 작성 철학을 일반 독자용으로 풀 수 있습니다.",
      targetAudience: audience,
      estimatedVerdict: "review_first",
      riskLevel: "low",
      verificationStatus: "needs_manual_review",
      suggestedAngle: "좋은 초안보다 사람이 승인할 수 있는 검수 구조가 중요하다는 관점입니다.",
      sourceHints: ["최근 Post", "검수 리포트", "SEO 패키지"],
    },
  ];
}

function normalizeIdea(raw: Partial<TopicIdea>, fallback: TopicIdea): TopicIdea {
  const estimatedVerdict: TopicIdea["estimatedVerdict"] =
    raw.estimatedVerdict === "hold" || raw.estimatedVerdict === "reject"
      ? raw.estimatedVerdict
      : "review_first";
  const riskLevel: TopicIdea["riskLevel"] =
    raw.riskLevel === "high" || raw.riskLevel === "medium" ? raw.riskLevel : "low";
  const verificationStatus: TopicIdea["verificationStatus"] =
    raw.verificationStatus === "official_confirmed" || raw.verificationStatus === "community_only"
      ? raw.verificationStatus
      : "needs_manual_review";
  const candidate = {
    ...fallback,
    ...raw,
    title: String(raw.title ?? fallback.title).trim(),
    rawTopic: String(raw.rawTopic ?? fallback.rawTopic).trim(),
    memo: String(raw.memo ?? fallback.memo).trim(),
    optionalKeywords: String(raw.optionalKeywords ?? fallback.optionalKeywords).trim(),
    avoidTopics: String(raw.avoidTopics ?? fallback.avoidTopics).trim(),
    reason: String(raw.reason ?? fallback.reason).trim(),
    targetAudience: String(raw.targetAudience ?? fallback.targetAudience).trim(),
    estimatedVerdict,
    riskLevel,
    verificationStatus,
    suggestedAngle: String(raw.suggestedAngle ?? fallback.suggestedAngle).trim(),
    sourceHints: Array.isArray(raw.sourceHints) ? raw.sourceHints.map(String).slice(0, 5) : fallback.sourceHints,
  };

  if (publicArticleInternalTermPattern.test(candidate.title) || publicArticleInternalTermPattern.test(candidate.rawTopic)) {
    return {
      ...candidate,
      title: `${candidate.title.replace(publicArticleInternalTermPattern, "REFUSE HUB 개발기").trim()}`,
      rawTopic: candidate.rawTopic.replace(publicArticleInternalTermPattern, "REFUSE HUB 개발기").trim(),
      reason: `${candidate.reason} 내부 구현명은 일반 글감이 아니라 REFUSE HUB 개발기 맥락에서만 다룹니다.`,
    };
  }

  return candidate;
}

export async function generateTopicIdeas(params: {
  blogProfile: BlogProfile;
  focusKeyword?: string | null;
}) {
  const fallback = fallbackIdeas(params.blogProfile);
  const [communitySignals, trendCandidates, officialSources] = await Promise.all([
    prisma.communitySignal.findMany({
      orderBy: { collectedAt: "desc" },
      take: 8,
      select: {
        sourceType: true,
        sourceName: true,
        title: true,
        signalType: true,
        riskLevel: true,
        verificationStatus: true,
      },
    }),
    prisma.trendCandidate.findMany({
      orderBy: [{ totalScore: "desc" }, { createdAt: "desc" }],
      take: 8,
      select: {
        keyword: true,
        verdict: true,
        scoringBasis: true,
        confidence: true,
        totalScore: true,
      },
    }),
    prisma.officialSource.findMany({
      orderBy: { addedAt: "desc" },
      take: 5,
      select: {
        sourceType: true,
        title: true,
        verificationStatus: true,
      },
    }),
  ]);
  const runtime = await getWriterRuntime();

  try {
    const provider = await createWriterProvider();
    const response = await provider.complete({
      responseFormat: "json",
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content: [
            "You suggest Korean blog column ideas for REFUSE HUB.",
            "Return JSON only with key ideas containing 5-10 items.",
            "Do not write articles. Suggest topics only.",
            "Prefer AI developer tools, vibe coding, Claude Code, Codex, ChatGPT, Gemini CLI, blog automation, coding agent workflows.",
            "Do not use internal implementation terms in general-public ideas. Internal implementation terms are allowed only when the idea is explicitly REFUSE HUB 개발기.",
            "Do not mark community_only ideas as write_now. Use review_first/hold/reject only.",
            "If official confirmation is missing, set verificationStatus to needs_manual_review or community_only and mention official confirmation need in reason/sourceHints.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            focusKeyword: params.focusKeyword ?? "",
            blogProfile: {
              blogName: params.blogProfile.blogName,
              targetAudience: params.blogProfile.targetAudience,
              defaultTone: params.blogProfile.defaultTone,
              preferredStructure: params.blogProfile.preferredStructure,
              seoRules: params.blogProfile.seoRules,
            },
            recentSignals: {
              communitySignals,
              trendCandidates,
              officialSources,
            },
            outputShape: {
              ideas: [
                {
                  title: "string",
                  rawTopic: "string",
                  memo: "string",
                  optionalKeywords: "comma-separated string",
                  avoidTopics: "comma-separated string",
                  reason: "string",
                  targetAudience: "string",
                  estimatedVerdict: "review_first | hold | reject",
                  riskLevel: "low | medium | high",
                  verificationStatus: "community_only | needs_manual_review | official_confirmed",
                  suggestedAngle: "string",
                  sourceHints: ["string"],
                },
              ],
            },
          }),
        },
      ],
    });
    const parsed = safeJsonParse<{ ideas?: Partial<TopicIdea>[] }>(response, {});
    const ideas = parsed.ideas?.map((idea, index) => normalizeIdea(idea, fallback[index % fallback.length])).filter((idea) => idea.title && idea.rawTopic);
    const output = ideas && ideas.length >= 5 ? ideas.slice(0, 10) : fallback;

    await prisma.generationLog.create({
      data: {
        action: "generateTopicIdeas",
        provider: runtime.provider,
        model: runtime.model,
        inputSummary: summarize(`focusKeyword=${params.focusKeyword ?? ""}, communitySignals=${communitySignals.length}, trendCandidates=${trendCandidates.length}`),
        outputSummary: `ideas=${output.length}`,
        status: "success",
        generationStatus: "success",
      },
    });

    return {
      ideas: output,
      generationStatus: "success" as const,
    };
  } catch (error) {
    await prisma.generationLog.create({
      data: {
        action: "generateTopicIdeas",
        provider: runtime.provider,
        model: runtime.model,
        inputSummary: summarize(`focusKeyword=${params.focusKeyword ?? ""}`),
        outputSummary: `fallbackIdeas=${fallback.length}`,
        status: "fallback",
        generationStatus: "fallback",
        errorMessage: error instanceof Error ? summarize(error.message) : "unknown_error",
      },
    });

    return {
      ideas: fallback,
      generationStatus: "fallback" as const,
      fallbackReason: "추천 칼럼 생성 provider 호출에 실패해 로컬 fallback 아이디어를 표시했습니다.",
    };
  }
}
