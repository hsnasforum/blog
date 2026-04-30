## 프로젝트 목적
이 프로젝트는 개인용 localhost 환경에서 블로그 글을 바로 자동 작성하지 않고, 다음 단계를 거쳐 사람이 승인할 수 있게 만드는 MVP입니다.

1. Topic 입력
2. Trend Scout 후보 생성
3. 화제성 점수 계산(외부 데이터 미연동 시 추정 점수)
4. 글 방향 추천
5. 기획안/초안/검수 리포트 생성
6. 사람 승인

## 왜 단순 GPT 래퍼가 아닌가
- 단순 프롬프트 1회 호출이 아니라, `Topic -> TrendCandidate -> Post Workflow` 상태를 DB에 저장합니다.
- 점수 체계를 분리해 작성 우선순위를 정량화합니다.
- 생성 결과마다 `GenerationLog`를 기록해 추적 가능성을 확보합니다.
- 승인 단계(`outline -> draft -> review -> approved`)를 강제해 자동 발행 사고를 줄입니다.
- Provider를 추상화해 `api-key`와 `oauth-proxy(OpenAI-compatible endpoint)`를 교체 가능하게 구성했습니다.

## 기술 스택
- Next.js App Router
- TypeScript
- Prisma
- SQLite
- Tailwind CSS
- OpenAI-compatible provider 구조

## 로컬 실행 방법
1. 의존성 설치

```bash
npm install
```

2. 환경변수 파일 생성 (`.env.example` 복사)

```bash
cp .env.example .env
```

개발 환경에서 `DATABASE_URL`이 비어 있으면 앱 서버가 `file:./dev.db`를 기본값으로 주입합니다. 운영 환경에서는 명확한 오류를 내므로 `.env`에 반드시 `DATABASE_URL`을 지정해야 합니다.

3. Prisma 마이그레이션 + 클라이언트 생성

```bash
npm run prisma:migrate -- --name init
npm run prisma:generate
```

4. 개발 서버 실행

```bash
npm run dev
```

5. 브라우저 접속

`http://localhost:3000`

## .env 예시

```env
DATABASE_URL="file:./dev.db"
WRITER_PROVIDER="oauth-proxy"
OPENAI_BASE_URL="http://127.0.0.1:10531/v1"
OPENAI_API_KEY="dummy-for-local-proxy"
WRITER_MODEL="gpt-5.5"
WRITER_REASONING_EFFORT="xhigh"
WRITER_MODEL_OPTIONS="gpt-5.3,gpt-5.2"

# Trend Scout v2 외부 신호 수집용, 서버에서만 사용
NAVER_CLIENT_ID=""
NAVER_CLIENT_SECRET=""
GITHUB_TOKEN=""
REDDIT_BEARER_TOKEN=""
REDDIT_SUBREDDIT_WHITELIST="LocalLLaMA,ChatGPTCoding,OpenAI"
STACKEXCHANGE_SITE="stackoverflow"
```

## Trend Scout v2 외부 신호 설정
Trend Scout v2는 기존 추정 점수(`estimated_without_external_data`) 위에 네이버 외부 신호를 추가로 수집해 `external_data` 점수로 재계산합니다.

- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`이 없으면 `트렌드 신호 수집` 버튼이 비활성화됩니다.
- 네이버 데이터랩 통합검색어 트렌드 API로 검색 상승률을 계산합니다.
- 네이버 뉴스 검색 API로 최신 기사 수, 최신 기사 날짜, 중복 제목 비율을 계산합니다.
- 네이버 블로그 검색 API로 최근 블로그 글 수와 후기/사용기성 표현을 계산합니다.
- 외부 수집이 실패하면 fallback 결과를 만들지 않고 기존 추정 점수를 유지합니다.
- 프론트엔드에는 네이버 시크릿을 전달하지 않고, 서버 API route(`/api/topics/[id]/collect-trends`)에서만 사용합니다.
- 검색 결과 원문 전체는 저장하지 않고 제목, 링크, 날짜와 집계 요약만 `TrendSignal`에 저장합니다.

개발/테스트에서 실제 네이버 API 없이 collector 흐름만 확인하려면 WSL 내부에서 mock collector smoke test를 실행합니다.

```bash
npm run test:trend:collector
```

## Community Radar
Community Radar는 뉴스보다 빠른 조기 신호를 보기 위한 보조 기능입니다. 국내 커뮤니티는 자동 수집하지 않고, 사용자가 직접 확인한 URL/제목/요약/signalType만 수동 입력합니다.

자동 수집 v1 범위:
- Hacker News: 공개 검색 API로 최근 story의 title/url/points/comment count만 저장합니다.
- GitHub Issues: 공개 REST Search API로 issue title/url/comment count/reaction count만 저장합니다. `GITHUB_TOKEN`은 선택이며 서버에서만 사용합니다.
- Stack Exchange: 공개 API로 최근 질문 title/link/score/answer count만 저장합니다.
- Reddit: `REDDIT_BEARER_TOKEN`과 `REDDIT_SUBREDDIT_WHITELIST`가 있을 때만 공식 OAuth API를 사용합니다. whitelist subreddit만 조회하고 댓글 전문은 저장하지 않습니다.

수집하지 않는 것:
- 로그인 필요한 페이지
- robots/약관 우회가 필요한 페이지
- 국내 커뮤니티 자동 스크래핑
- 댓글/본문 전문 대량 저장
- 출처 없는 사용자 의견 생성

Community Heat 반영 규칙:
- 커뮤니티 신호가 있으면 `communityHeatScore`와 `riskPenalty`를 재계산합니다.
- 단일 커뮤니티 출처만 있으면 `write_now`를 허용하지 않습니다.
- 2개 이상 출처 반복 신호와 GitHub Issues 또는 뉴스 확인이 함께 있을 때만 `write_now`가 가능합니다.
- `signalType=rumor`는 큰 risk penalty를 적용합니다.

수동 입력 화면:
- `/topics/[id]/community`

mock collector smoke test:

```bash
npm run test:community:radar
```

DCInside Manual HTML Import parser QA는 자동 fetch 없이 사람이 복사한 목록 HTML로 진행합니다.

1. `/topics/[id]/community`에서 DCInside 목록 HTML을 붙여넣습니다.
2. `파싱 미리보기`를 실행합니다.
3. 화면의 미리보기 JSON과 QA 요약을 확인합니다.
4. `QA 파일로 저장`을 눌러 `manual-fixtures/dcinside-info-preview-latest.json` 또는 `manual-fixtures/dcinside-best-preview-latest.json`에 저장합니다.
5. Codex는 `manual-fixtures/*.json` 기준으로 parser QA를 진행합니다.

QA fixture에는 파싱된 signal 메타데이터만 저장합니다. 원문 HTML, 본문, 댓글 전문, 이미지 원문은 저장하지 않습니다.

## Provider 설정 방법
Provider는 `lib/writer/providers`와 `lib/writer/provider-factory.ts`로 구성됩니다.
처음 실행 시 `.env` 값으로 `ProviderConfig`가 생성되고, 이후 `/settings/provider`에서 mode, base URL, model을 변경할 수 있습니다.

- `WRITER_PROVIDER=api-key`
  - `OPENAI_API_KEY`가 실제 API 키여야 합니다.
  - 기본 endpoint는 `https://api.openai.com/v1` (또는 `OPENAI_BASE_URL` 커스텀 값)
- `WRITER_PROVIDER=oauth-proxy`
  - OAuth 토큰을 앱 DB에 저장하지 않습니다.
  - OpenAI-compatible proxy endpoint (`OPENAI_BASE_URL`)만 호출합니다.
  - 브라우저에는 토큰/비밀값을 전달하지 않고, 서버 API route에서만 모델 호출을 수행합니다.
  - `/settings/provider`의 인증 확인은 서버가 proxy의 `/models` endpoint를 호출해 인증 상태와 모델 목록을 확인합니다.

reasoning 모델 설정:
- `WRITER_REASONING_EFFORT` 허용값은 `none`, `minimal`, `low`, `medium`, `high`, `xhigh`입니다.
- `gpt-5`, `gpt-5.*`, `gpt-5.*-mini`, `gpt-5.*-codex`, `codex` 계열은 reasoning effort 지원 모델로 간주합니다.
- 현재 로컬 `oauth-proxy`의 OpenAI-compatible 경로는 Chat Completions 요청에서 `reasoning_effort`를 전달합니다.
- reasoning 모델에는 `temperature`를 보내지 않습니다.
- 허용값 밖의 값이 들어오면 서버에서 `medium`으로 대체하고 warning을 남깁니다.
- `/settings/provider` 화면에서는 현재 적용 중인 reasoning effort를 표시만 합니다. 실제 값은 `.env`에서 관리합니다.

## api-key 방식과 oauth-proxy 방식 차이
- 공통점
  - 둘 다 OpenAI-compatible chat completion 호출 구조입니다.
  - 프론트엔드 직접 호출 없이 서버 API route로만 요청합니다.
- 차이점
  - `api-key`: 애플리케이션이 API 키 기반으로 직접 인증합니다.
  - `oauth-proxy`: 로컬/사내 proxy가 인증을 대행하며, 앱은 proxy endpoint와 placeholder 키만 사용 가능합니다.

## 자동 발행을 제외한 이유
- 개인용 도구에서도 오발행 리스크가 큽니다.
- 이 MVP는 품질 통제(기획/초안/검수/승인)의 안정성 검증이 우선입니다.
- 승인된 결과를 사람이 최종 확인한 뒤 수동 발행하는 흐름을 기본으로 둡니다.

## 주요 경로
- `/settings/blog-profile`
- `/settings/provider`
- `/topics/new`
- `/topics/[id]/trends`
- `/posts/[id]/workflow`

## Auto Workflow 진행률 운영 메모
Auto Scout와 Auto Draft는 자동 발행이나 자동 승인이 아니라, 승인 전 단계까지의 반복 작업을 묶어 실행하는 보조 흐름입니다.

현재 구조:
- 클라이언트가 먼저 `WorkflowRun`을 만들고 `runId`를 받습니다.
- 이후 Auto Scout 또는 Auto Draft 서버 요청이 실행됩니다.
- 서버 요청 내부에서 단계별로 `WorkflowRunStep` 상태와 진행률을 DB에 저장합니다.
- UI는 `GET /api/workflow-runs/[runId]`를 polling해 진행률, 현재 단계, warning, 실패 단계를 보여줍니다.
- 새로고침 후에도 같은 `runId`로 마지막 실행 상태를 복구할 수 있습니다.
- 주요 생성 단계는 `WorkflowRunStep.generationLogId`로 `GenerationLog`와 연결해 사후 추적할 수 있습니다.

운영 기준:
- `partial`은 실패가 아니라 확인할 warning이 있는 상태입니다.
- GitHub Issues 결과 없음, 공식 출처 없음, 일부 collector 실패, fallback 사용, `community_only`로 인한 `write_now` 차단은 warning으로 봅니다.
- 후보 생성 실패, draft 생성 실패, reviewReport 생성 실패, DB 저장 실패, export 준비 실패는 failed로 봅니다.
- Auto Draft가 100% 완료되어도 `workflowStep=review`에서 멈추며, `approvedAt`은 자동 설정하지 않습니다.

장기 개선 TODO:
- 긴 서버 요청을 더 잘게 나눈 클라이언트 주도 단계별 API 실행
- 실패 단계만 다시 실행하는 단계별 재시도 API
- provider 호출 중 cancel은 즉시 중단이 아니라 다음 단계 진행 차단으로 처리
- Auto Scout / Auto Draft / Column Ideas 공통 workflow runner 추상화
- 배포 환경의 장시간 요청 timeout 대응
- 공통 dev server 1개와 순차 E2E 구조 유지

## REFUSE HUB BlogProfile 프리셋
`/settings/blog-profile` 화면에는 `REFUSE HUB 프리셋 적용` 버튼이 있습니다.

- 버튼은 화면 입력값만 채우며, DB 값은 `설정 저장`을 눌렀을 때만 바뀝니다.
- 기존 DB의 BlogProfile 값은 앱 시작이나 페이지 진입만으로 조용히 덮어쓰지 않습니다.
- 프리셋은 보고서/검수 문서/내부 구현 문서 톤을 줄이고, 실제 블로그 글처럼 결론, 판단 기준, 사용 장면, 개인적인 운영 기준을 먼저 드러내도록 구성되어 있습니다.
- 일반 글에서는 `WriterService`, `GenerationLog`, `approval guard`, `API route`, `oauth-proxy` 같은 내부 구현 용어를 피하고, REFUSE HUB 개발기처럼 구현 자체가 주제일 때만 사용합니다.
- 비교 글 태그는 `Claude Code`, `Claude Opus`, `Claude Sonnet`, `Opus Sonnet 차이`, `Claude Code 모델 선택`처럼 실제 검색자가 입력할 표현을 우선합니다.

## Community Radar 보강 소스
DCInside Manual HTML Import로 만든 커뮤니티 조기 신호는 GitHub Issues로 보강 검색할 수 있습니다. 이 수집기는 GitHub Search Issues API의 공개 메타데이터만 사용하며 issue 본문, 댓글 전문, 이미지 원문은 저장하지 않습니다.

`GITHUB_TOKEN`은 선택값입니다. 값이 있으면 서버에서만 `Authorization` 헤더로 사용해 rate limit을 완화하고, 값이 없으면 unauthenticated public API로 동작하면서 rate limit warning을 표시합니다.

```env
GITHUB_TOKEN=""
STACK_EXCHANGE_KEY=""
```

GitHub Issues 신호는 공식 문서가 아니라 보강 신호입니다. 일반 issue는 `cross_source_matched` 또는 `needs_manual_review`로 저장되며, 사람이 공식 출처 확인을 추가하기 전에는 자동으로 `official_confirmed`로 올리지 않습니다.

## 안전한 E2E 실행 방법
Windows Defender의 ClickFix 계열 오탐을 피하기 위해 E2E 테스트는 PowerShell here-string, `wsl -e tee`, `/tmp` JS 생성 방식으로 실행하지 않습니다.
테스트 코드는 프로젝트 내부의 정식 파일인 `scripts/e2e/provider-success.mjs`에 보관하고, npm script로만 실행합니다.

Next dev server를 띄우는 E2E는 병렬 실행하지 않는 것을 권장합니다. 여러 E2E가 동시에 `.next` 개발 빌드 산출물을 쓰면 특정 페이지 chunk나 App Router page module이 일시적으로 500을 낼 수 있습니다. 전체 검증은 순차 실행 스크립트를 사용합니다.

```bash
npm run test:e2e:all:serial
```

순차 실행 순서:

1. `npm run test:community:radar`
2. `npm run test:dcinside:preview-qa`
3. `npm run test:e2e:official-verification`
4. `npm run test:e2e:community-article`
5. `npm run test:e2e:github-issues-boost`
6. `npm run test:e2e:provider:oauth`

`test:e2e:all:serial`은 각 테스트의 시작/종료 시간과 전체 소요 시간을 출력하고, 하나라도 실패하면 즉시 중단합니다. 출력 중 `Authorization`, API key, OAuth token, GitHub/Reddit token 형태의 값은 마스킹합니다.

`test:e2e:provider`는 현재 셸과 `.env`의 provider 설정을 그대로 사용하는 generic 스크립트입니다. `.env`가 `WRITER_PROVIDER=api-key`이고 실제 `OPENAI_API_KEY`가 없으면 인증 실패가 정상입니다.

```bash
npm run test:e2e:provider
```

로컬 oauth-proxy 기준으로 provider E2E를 검증하려면 WSL 내부 셸에서 전용 스크립트를 사용합니다. 이 스크립트는 실제 API key를 넣지 않고 로컬 proxy용 dummy key만 사용합니다.

```bash
npm run test:e2e:provider:oauth
```

전용 스크립트가 명시하는 값:

```env
DATABASE_URL=file:./dev-e2e.db
E2E_CLEANUP_DB=1
WRITER_PROVIDER=oauth-proxy
OPENAI_BASE_URL=http://127.0.0.1:10531/v1
OPENAI_API_KEY=dummy-for-local-proxy
WRITER_MODEL=gpt-5.5
WRITER_REASONING_EFFORT=xhigh
```

공식 api-key provider를 테스트해야 할 때는 실제 키를 package script에 넣지 말고 현재 셸에서만 주입한 뒤 generic 스크립트를 실행합니다.

```bash
DATABASE_URL="file:./dev-e2e.db" \
WRITER_PROVIDER="api-key" \
OPENAI_BASE_URL="https://api.openai.com/v1" \
OPENAI_API_KEY="$OPENAI_API_KEY" \
WRITER_MODEL="사용할-모델-id" \
npm run test:e2e:provider
```

동작 내용:
- `npx prisma migrate deploy`로 E2E SQLite DB를 준비합니다.
- 별도 포트(`E2E_PORT`, 기본 `3030`)로 Next dev server를 띄웁니다.
- `/api/provider-auth/check`부터 후보 생성, 점수 계산, outline/draft/review/approval, `GenerationLog`까지 검증합니다.
- `Authorization`, API key, OAuth token, `auth.json` 내용은 출력하지 않도록 마스킹합니다.
- `test:e2e:provider:oauth`는 `dev-e2e.db`에 남은 과거 로그가 결과에 섞이지 않도록 안전 검사를 통과한 E2E SQLite DB만 시작/종료 시 정리합니다.

임시 DB를 테스트 종료 후 정리하려면 DB 파일명에 `e2e`가 들어간 SQLite 경로에서만 다음 옵션을 사용합니다.

```bash
DATABASE_URL="file:./dev-e2e.db" E2E_CLEANUP_DB=1 npm run test:e2e:provider
```

또는:

```bash
DATABASE_URL="file:./dev-e2e.db" npm run test:e2e:provider -- --cleanup-db
```

E2E 실행 안정화 장기 TODO:

1. E2E마다 고유 `E2E_PORT`를 계속 유지합니다.
2. E2E마다 고유 `DATABASE_URL`을 계속 사용합니다.
3. 병렬 실행이 필요해지면 Next `distDir` 격리를 검토합니다.
4. 더 나은 방향은 공통 dev server 1개를 띄우고 여러 E2E가 같은 서버를 순차적으로 사용하는 구조입니다.

## 향후 확장 계획
- 실제 외부 데이터 연동(검색 트렌드/뉴스/커뮤니티)으로 추정 점수 고도화
- 근거 링크 자동 수집 + 사실 검증 보조
- `BlogProfile.userOpinionRules` 필드 분리: 실제 사용자 의견 출처, 직접 경험/외부 의견 구분, 인용/의역 정책을 별도 설정으로 관리
- 모델별 역할 분리:
  - 1차 draft는 `gpt-5.4-mini` `medium/high`로 생성해 속도와 글 길이를 안정화
  - review와 SEO는 `gpt-5.5` `xhigh`로 실행해 검수와 검색 패키지 품질 강화
  - 사용자가 발행 후보로 선택한 글만 별도 "최종 다듬기" 단계에서 `gpt-5.5` `xhigh` rewrite 실행
- 승인 후 발행 연동(별도 opt-in 기능)
- 버전 비교(diff) 기반 rewrite 히스토리
- 템플릿/카테고리별 워크플로우 분기
