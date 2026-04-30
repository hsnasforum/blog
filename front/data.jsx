// ============ Mock data ============

const MOCK_PROFILE = {
  blogName: "테크인사이트",
  ownerName: "민지",
  niche: "개발 / 생산성 / AI 도구",
  toneTags: ["분석적", "친근함", "실용 중심"],
  audience: "30대 IT 직장인 · 사이드 프로젝트 운영자",
  excludeTopics: ["정치", "투자 자문"],
};

const MOCK_PROVIDER = {
  provider: "Anthropic",
  model: "claude-sonnet-4-5",
  mode: "balanced",
  monthlyCost: 12.4,
  monthlyTokens: 1842300,
};

const SEED_TOPICS = [
  {
    id: "t-101",
    rawTopic: "Vibe coding과 주니어 개발자 생산성",
    memo: "최근 트위터에서 논쟁 중. 실증 데이터 부족.",
    status: "trends_ready",
    createdAt: "2026-04-26T09:11:00",
    candidatesCount: 8,
    postsCount: 2,
  },
  {
    id: "t-102",
    rawTopic: "M5 MacBook Pro 실사용 리뷰",
    memo: "발매 직후 — 게이밍/코딩 양쪽 다 다뤄볼 만함",
    status: "draft_in_progress",
    createdAt: "2026-04-24T19:05:00",
    candidatesCount: 12,
    postsCount: 3,
  },
  {
    id: "t-103",
    rawTopic: "1인 개발자가 쓸만한 AI 코드 리뷰 도구",
    memo: null,
    status: "approved",
    createdAt: "2026-04-22T11:42:00",
    candidatesCount: 6,
    postsCount: 1,
  },
  {
    id: "t-104",
    rawTopic: "Notion vs Obsidian 2026 선택 가이드",
    memo: "Obsidian Sync 2.0 발표 이후 변화 정리",
    status: "scoring",
    createdAt: "2026-04-21T08:30:00",
    candidatesCount: 4,
    postsCount: 0,
  },
  {
    id: "t-105",
    rawTopic: "사이드 프로젝트 수익화 패턴",
    memo: null,
    status: "draft_in_progress",
    createdAt: "2026-04-19T15:22:00",
    candidatesCount: 9,
    postsCount: 2,
  },
];

const SEED_CANDIDATES = [
  {
    id: "c-1", topicId: "t-101",
    keyword: "vibe coding 정의 vs prompt engineering",
    rationale: "혼용되는 두 용어를 명확히 구분하는 가이드 — 검색 의도가 명확하고 경쟁 적음.",
    totalScore: 86,
    sub: { SG: 18, NV: 16, CH: 14, BF: 18, DF: 12, LS: 10, RP: -2 },
    verdict: "write_now",
    basis: "external_data",
    confidence: "high",
    titles: [
      "Vibe coding이란? 프롬프트 엔지니어링과 무엇이 다른가",
      "2026년 Vibe coding 가이드 — 실무에서 쓰는 5가지 패턴",
    ],
    angle: "정의 → 차이점 → 실무 적용 사례 → 한계 순으로 정리",
    sources: ["Naver DataLab", "Hacker News", "GitHub Issues"],
    heat: 78,
  },
  {
    id: "c-2", topicId: "t-101",
    keyword: "주니어 개발자 AI 도구 활용",
    rationale: "검색량 꾸준히 증가, 블로그 적합도 매우 높음.",
    totalScore: 78,
    sub: { SG: 16, NV: 12, CH: 16, BF: 18, DF: 10, LS: 8, RP: -2 },
    verdict: "write_now",
    basis: "external_data",
    confidence: "high",
    titles: [
      "주니어 개발자가 1년 안에 시니어급 산출물을 만드는 AI 워크플로우",
      "실수 없이 빠르게 — 주니어용 AI 코드 리뷰 루틴",
    ],
    angle: "주니어 입장에서 시간 절약 + 학습 효과 두 마리 토끼",
    sources: ["Naver Blog", "Reddit"],
    heat: 64,
  },
  {
    id: "c-3", topicId: "t-101",
    keyword: "AI 페어 프로그래밍 비교",
    rationale: "도구 비교는 오래된 테마지만 2026년 신규 도구 추가로 재조명.",
    totalScore: 72,
    sub: { SG: 14, NV: 14, CH: 12, BF: 16, DF: 8, LS: 10, RP: -2 },
    verdict: "review_first",
    basis: "external_data",
    confidence: "medium",
    titles: ["Cursor, Claude Code, Cody — 2026년 누가 가장 빠른가"],
    angle: "벤치 + 실제 PR 작성 시간 측정",
    sources: ["Naver News", "Hacker News"],
    heat: 52,
  },
  {
    id: "c-4", topicId: "t-101",
    keyword: "코딩 부트캠프 무용론",
    rationale: "민감한 주제 — 양쪽 입장 정리 필요.",
    totalScore: 58,
    sub: { SG: 12, NV: 10, CH: 18, BF: 8, DF: 6, LS: 6, RP: -2 },
    verdict: "review_first",
    basis: "community_signal",
    confidence: "medium",
    titles: ["AI 시대, 부트캠프는 끝났는가 — 데이터로 보는 현실"],
    angle: "수료생 취업률 + 채용 공고 트렌드 결합",
    sources: ["Reddit", "DCInside"],
    heat: 88,
  },
  {
    id: "c-5", topicId: "t-101",
    keyword: "AI 코드 보안 리뷰",
    rationale: "기업 도입 사례 부족. 1차 자료 확보 어려움.",
    totalScore: 47,
    sub: { SG: 10, NV: 8, CH: 8, BF: 10, DF: 8, LS: 6, RP: -3 },
    verdict: "hold",
    basis: "estimated_without_external_data",
    confidence: "low",
    titles: [],
    angle: null,
    sources: ["Naver News"],
    heat: 24,
  },
  {
    id: "c-6", topicId: "t-101",
    keyword: "AI로 레거시 마이그레이션",
    rationale: "수요는 있으나 1차 출처 확보 어려움 — 보류 권장.",
    totalScore: 38,
    sub: { SG: 8, NV: 6, CH: 6, BF: 12, DF: 4, LS: 4, RP: -2 },
    verdict: "reject",
    basis: "estimated_without_external_data",
    confidence: "low",
    titles: [],
    angle: null,
    sources: [],
    heat: 12,
  },
];

const SEED_POSTS = [
  {
    id: "p-1", topicId: "t-101", candidateId: "c-1",
    title: "Vibe coding이란? 프롬프트 엔지니어링과 무엇이 다른가",
    angle: "정의 → 차이점 → 실무 적용 사례 → 한계 순으로 정리",
    workflowStep: "review",
    updatedAt: "2026-04-28T14:08:00",
    outline: `# Vibe coding 가이드

## 1. 도입
- 최근 X(Twitter)에서 논쟁 중인 키워드
- 1인 개발자, 주니어가 가장 많이 검색

## 2. 정의
- 자연어로 의도를 전달하고 AI가 코드 결정
- prompt engineering과의 1줄 비교

## 3. 차이점 (vs prompt engineering)
- 추상화 수준
- 결과물에 대한 책임 소재
- 코드 리뷰 방식

## 4. 실무 적용 사례
- 사이드 프로젝트 / MVP
- 레거시 코드 분석
- 테스트 작성

## 5. 한계와 주의점
- 보안 / 라이선스
- 디버깅 어려움
- 기술 부채 누적

## 6. 마무리 — 언제 쓰고 언제 피해야 하는가`,
    draft: `# Vibe coding이란? 프롬프트 엔지니어링과 무엇이 다른가

요즘 개발자 커뮤니티에서 "vibe coding"이라는 단어를 자주 봅니다. Andrej Karpathy가 트윗 한 줄로 띄운 이 개념은 1년 만에 1인 개발자, 주니어, 그리고 일부 시니어들 사이에서도 작업 방식 자체를 흔들고 있습니다.

이 글에서는 vibe coding이 무엇인지, 흔히 혼동되는 prompt engineering과 어떻게 다른지, 그리고 어떤 상황에서 효과적이고 어떤 상황에서는 피해야 하는지를 정리합니다.

## Vibe coding이란

가장 간결하게 말하면 — **결과물을 자연어로 묘사하고, 코드는 AI에게 맡기는 작업 방식**입니다. 개발자는 "이런 화면이 되어야 하고, 이렇게 동작했으면 좋겠다"를 설명할 뿐, 어떤 함수가 호출되고 어떤 자료구조가 쓰이는지는 직접 결정하지 않습니다.

전통적인 코딩이 "어떻게(how)"에 집중한다면, vibe coding은 "무엇을(what), 어떤 느낌으로(vibe)"에 집중합니다. ...

## Prompt engineering과 무엇이 다른가

| | Prompt Engineering | Vibe Coding |
|---|---|---|
| 추상화 수준 | 모델 출력을 정밀 제어 | 결과물 단위로 위임 |
| 책임 | 프롬프트 작성자 | 검수하는 개발자 |
| 산출물 | 답변, 분류, 요약 | 동작하는 코드 |

[... 본문 계속 ...]`,
    reviewReport: `## 검수 결과 — review_first

**전체 점수: 78 / 100**

### ✅ 잘된 점
- 도입부 — 시의성 있는 트윗 인용으로 흥미 유발
- 정의/차이 비교표가 명확함
- 1인 개발자/주니어 페르소나 타겟팅 적절

### ⚠️ 개선 필요
1. **3절 차이점** — prompt engineering 측 사례 1개만 있음. 2개 더 필요.
2. **5절 한계** — 보안 부분 추상적. CVE 사례 1개 인용 권장.
3. **결론** — 행동 유도(CTA) 부족. "어떤 상황에서 시도할지" 의사결정 트리 추가 권장.

### 🚫 금칙어/규정
- 통과. 광고성 표현, 미검증 통계 없음.

### SEO
- 타이틀 길이: 28자 ✓
- 메타 설명 누락 — 추가 필요
- 내부 링크 0개 — 2~3개 추천`,
    seoPackage: null,
  },
  {
    id: "p-2", topicId: "t-102", candidateId: null,
    title: "M5 MacBook Pro — 코딩과 게이밍, 둘 다 잡았는가",
    angle: "양쪽 워크로드를 7일간 직접 사용하며 실측",
    workflowStep: "draft",
    updatedAt: "2026-04-27T18:30:00",
    outline: `## 개요\n## 사양 비교 (M4 vs M5)\n## 코딩 워크로드 — 빌드 시간 측정\n## 게이밍 — Cyberpunk, Baldur's Gate 3\n## 발열 / 배터리\n## 결론`,
    draft: "[초안 작성 중 — 약 60% 완료]",
    reviewReport: null,
    seoPackage: null,
  },
  {
    id: "p-3", topicId: "t-103", candidateId: null,
    title: "1인 개발자를 위한 AI 코드 리뷰 도구 비교 가이드",
    angle: "비용 대비 효율 관점에서 5개 도구 직접 사용",
    workflowStep: "approved",
    updatedAt: "2026-04-23T10:14:00",
    outline: "(완성)",
    draft: "(완성된 초안)",
    reviewReport: "(완성된 검수 리포트)",
    seoPackage: "(완성된 SEO 패키지)",
  },
];

const SEED_LOGS = [
  { id: "l-1", action: "generate-outline", status: "success", provider: "Anthropic", model: "claude-sonnet-4-5", input: "candidate c-1 — vibe coding 정의 vs prompt engineering", output: "6개 섹션 outline 생성", at: "2026-04-28T14:01:00" },
  { id: "l-2", action: "generate-draft", status: "success", provider: "Anthropic", model: "claude-sonnet-4-5", input: "post p-1 — outline 기반", output: "본문 약 1,840 단어", at: "2026-04-28T14:05:00" },
  { id: "l-3", action: "review", status: "success", provider: "Anthropic", model: "claude-sonnet-4-5", input: "post p-1 — draft 검수", output: "review_first / 78점", at: "2026-04-28T14:08:00" },
  { id: "l-4", action: "trend-scout", status: "success", provider: "Internal", model: "scout-v2", input: "topic t-101", output: "8 candidates", at: "2026-04-26T09:14:00" },
  { id: "l-5", action: "generate-draft", status: "fallback", provider: "Anthropic", model: "claude-sonnet-4-5", input: "post p-2", output: "fallback to gpt-4o-mini — rate limit", at: "2026-04-27T18:24:00" },
];

const STATUS_LABELS = {
  draft_pending: "토픽 입력됨",
  scoring: "점수 계산 중",
  trends_ready: "후보 준비됨",
  draft_in_progress: "초안 작업 중",
  approved: "승인 완료",
};

const VERDICT_META = {
  write_now: { label: "바로 작성", short: "WRITE", tone: "success" },
  review_first: { label: "검토 후 작성", short: "REVIEW", tone: "info" },
  hold: { label: "보류", short: "HOLD", tone: "warn" },
  reject: { label: "제외", short: "REJECT", tone: "danger" },
  unscored: { label: "미계산", short: "—", tone: "muted" },
};

const STEP_ORDER = ["outline", "draft", "review", "approved"];
const STEP_LABEL = {
  outline: "개요",
  draft: "초안",
  review: "검수",
  approved: "승인",
};

function fmtDate(s) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("ko-KR", { hour12: false, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fmtRelative(s) {
  if (!s) return "—";
  const d = new Date(s); const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff/60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff/3600)}시간 전`;
  return `${Math.floor(diff/86400)}일 전`;
}

Object.assign(window, {
  MOCK_PROFILE, MOCK_PROVIDER, SEED_TOPICS, SEED_CANDIDATES, SEED_POSTS, SEED_LOGS,
  STATUS_LABELS, VERDICT_META, STEP_ORDER, STEP_LABEL,
  fmtDate, fmtRelative,
});
