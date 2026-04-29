import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const port = Number(process.env.E2E_COMMUNITY_ARTICLE_PORT ?? 3034);
const appBaseUrl = `http://127.0.0.1:${port}`;
const providerMode = "oauth-proxy";
const providerBaseUrl = process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:10531/v1";
const providerModel = process.env.WRITER_MODEL ?? "gpt-5.5";
const reasoningEffort = process.env.WRITER_REASONING_EFFORT ?? "xhigh";

process.env.DATABASE_URL ||= "file:./community-article-e2e.db";
process.env.WRITER_PROVIDER = providerMode;
process.env.OPENAI_BASE_URL = providerBaseUrl;
process.env.OPENAI_API_KEY ||= "dummy-for-local-proxy";
process.env.WRITER_MODEL = providerModel;
process.env.WRITER_REASONING_EFFORT = reasoningEffort;
process.env.GITHUB_ISSUES_COLLECTOR_MODE = "mock";
process.env.GITHUB_TOKEN = "";

const cleanupDb = process.env.E2E_CLEANUP_DB !== "0";
const timeoutMs = Number(process.env.E2E_TIMEOUT_MS ?? 240_000);
const signalInput = {
  title: "클로드 프로, 클코에 오푸스 제공 중단 예정",
  sourceType: "dcinside",
  sourceName: "DCInside 특이점갤 정보탭",
  sourceTab: "info",
  signalType: "service_change",
  riskLevel: "medium",
  verificationStatus: "community_only",
  url: "https://gall.dcinside.com/mgallery/board/view/?id=thesingularity&no=1147981&search_head=10&page=1",
};
const requiredLogActions = [
  "createCandidateFromCommunitySignal",
  "generateAngle",
  "generateOutline",
  "generateDraft",
  "writer_editorial_pass",
  "reviewDraft",
  "generateSeoPackage",
];
const dangerousMarkupPattern = /rawHtml|originalHtml|<tr|<script|<iframe|onerror|javascript:/i;
const titleBadPattern =
  /클로드\s*프로,\s*클코\s*오푸스\s*제공\s*중단\s*확정|오푸스\s*제공\s*중단\s*확정|Claude\s*Code\s*Opus\s*중단\s*확정/i;
const titleAwkwardRepeatPattern = /확인\s*전\s*확인|공식\s*확인\s*전\s*확인|확인\s*필요\s*확인/i;
const titleReviewPattern = /중단설|공식\s*확인\s*전|체크할\s*것|확인해야\s*할\s*점|검토/i;
const titleModelComparisonPattern = /Claude\s*Code/i;
const titleOpusSonnetPattern = /Opus[\s\S]{0,40}Sonnet|Sonnet[\s\S]{0,40}Opus|오푸스[\s\S]{0,40}소넷|소넷[\s\S]{0,40}오푸스/i;
const titleDriftPattern = /대체\s*도구|도구\s*비교|블로그\s*자동화|자동\s*작성/i;
const draftCautionPatterns = [
  /커뮤니티\s*조기\s*신호/,
  /공식\s*확인/,
  /확인\s*필요/,
  /단정하기\s*어렵/,
  /검토/,
  /출처\s*확인/,
  /말하기\s*이릅니다/,
  /그렇게\s*보기엔\s*이릅니다/,
  /확인해야\s*할\s*신호/,
  /공식\s*안내/,
  /공식\s*문서/,
  /중단\s*확정보다는/,
  /루머/,
  /공식\s*발표/,
  /커뮤니티[\s\S]{0,80}신호/,
  /GitHub\s*Issues?[\s\S]{0,120}공식/i,
];
const draftInternalTermPattern =
  /WriterService|GenerationLog|approval\s*guard|provider\s*success\s*E2E|API\s*route|\/api\/|DB\s*model|oauth-proxy|OpenAI-compatible\s*provider|fallback\s*provider|scoring\s*v2|TrendCandidate|sourceMetaJson|verificationStatus|needs_manual_review|official_confirmed|approved\s*=\s*false|publish\s*API|Tistory\s*Export|자동\s*발행\s*구조/i;
const internalTagPattern =
  /provider\s*success\s*e2e|generationlog|writerservice|approval\s*guard|oauth-proxy|openai-compatible\s*provider|next\.?js\s*api\s*route|tistory\s*export|api\s*route|trendcandidate|sourcemetajson|needs_manual_review|자동화|seo/i;
const sourceTagPattern = /dcinside|디씨|특이점갤/i;
const searchIntentTagPattern =
  /Claude\s*Code|Claude\s*Pro|Opus|오푸스|AI\s*코딩\s*도구|모델\s*제공\s*중단|개발자\s*요금제|AI\s*도구\s*검토|클로드|클코/i;
const requiredCommunityTagPatterns = [/Claude\s*Code|클코/i, /Opus|오푸스/i, /Sonnet|소넷/i, /차이|선택\s*기준|모델\s*선택/i];
const personalJudgmentPattern =
  /개인적으로|개인적인\s*판단|내가\s*보기엔|내\s*판단|제\s*판단|저는|제가\s*추천|제가\s*보기엔|현실적인\s*대응|바로\s*갈아타기보다|대응\s*방향|마무리/i;
const modelComparisonConclusionPattern =
  /Sonnet은\s*기본\s*작업|Sonnet.*기본.*작업|Opus는\s*실패\s*비용|Opus.*실패\s*비용/i;
const firstSectionConclusionPattern =
  /^#{1,2}\s*결론|^##\s*결론|Sonnet은\s*기본\s*작업[\s\S]{0,400}Opus는\s*실패\s*비용/i;
const secondSectionCriteriaPattern = /Opus|Sonnet|오푸스|소넷|기준|핵심|나누/i;
const secondSectionRumorDriftPattern = /중단|퇴역|공식\s*확인/i;
const rumorSectionTitlePattern = /중단설|중단|안\s*보인|공식\s*확인|계정|플랜|모델\s*선택\s*화면|UI\s*표시|일시\s*장애/i;
const bodyHtmlMixedMetadataPattern = /메타\s*설명\s*:|태그\s*:|추천\s*태그|SEO\s*title|metaDescription|reviewReport|검수\s*리포트/i;
const escapedTistoryTagPattern = /&lt;(p|h2|h3)\s+data-ke-size/i;
const defensiveAuditPhrasePattern =
  /현재\s*이\s*글에서\s*공식\s*자료를\s*근거로|단정할\s*수는\s*없습니다|모두\s*확인\s*필요로\s*두는\s*것이\s*안전합니다|현재\s*입력\s*기준|공식\s*확인된\s*자료는\s*없습니다/i;
const naturalSafetyPhrasePattern =
  /아직(?:은)?[\s\S]{0,40}말하기\s*이릅니다|저는[\s\S]{0,80}보는\s*편이\s*맞다고\s*봅니다|중단\s*확정보다는\s*확인해야\s*할\s*신호|작업별\s*의존도|결론을\s*서두르지\s*않는\s*편이\s*낫다고\s*봅니다|내\s*계정과\s*작업\s*환경/i;
const realUsageOpeningPattern =
  /큰\s*코드베이스|코드베이스|실제\s*작업|작업하다\s*보면|Claude\s*Code를\s*쓰다\s*보면|모델\s*선택은|버그\s*수정|리팩터링|세션|권한|인증/i;
const transitionSentencePattern =
  /그래서\s*먼저\s*볼\s*것은|이\s*기준을\s*잡고\s*나면|다만\s*중단설|별도로\s*확인해야|작업별\s*선택은|모델\s*이름이\s*아니라\s*실패\s*비용|기준이\s*흔들릴\s*수/i;
const densityPatternSet = [
  /실패\s*비용/i,
  /작업별|작업\s*기준/i,
  /Opus[\s\S]{0,80}Sonnet|Sonnet[\s\S]{0,80}Opus/i,
  /모델\s*선택|선택\s*화면|설정\s*항목/i,
  /비용|속도|검증\s*가능성/i,
  /체크리스트|직접\s*확인|내\s*환경/i,
  /통화|금액\s*표시|인증|세션|권한|메일|검색|결제|이미지\s*변환/i,
];
const communityRumorWatchFailureFixtures = [
  "DB model에 `GenerationLog` 필드를 추가하는 초안 작성",
  "/api/internal/generations route에서 provider 호출 흐름 설명",
  "루머성 글감에 `needs_manual_review` 상태를 붙이는 리뷰 조건 작성",
  "if 공식 확인이 나온다, then 공식 사실과 마이그레이션 가이드를 분리해 업데이트한다",
  "if 루머로 반박된다, then 제공 중단 글이 아니라 루머 검증 실패 사례로 전환한다",
];

let devServer = null;
let stoppingDevServer = false;

function logStep(message) {
  console.log(`[community-article] ${message}`);
}

function sanitize(raw) {
  let text = typeof raw === "string" ? raw : JSON.stringify(raw);
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    text = text.split(apiKey).join("[redacted-api-key]");
  }

  return text
    .replace(/authorization["']?\s*:\s*["']?bearer\s+[^"',\s}]+/gi, "authorization: [redacted]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/access_token["']?\s*[:=]\s*["']?[^"',\s}]+/gi, "access_token: [redacted]")
    .replace(/refresh_token["']?\s*[:=]\s*["']?[^"',\s}]+/gi, "refresh_token: [redacted]");
}

function appendRing(buffer, chunk, maxLines = 80) {
  const lines = sanitize(chunk.toString()).split(/\r?\n/).filter(Boolean);
  buffer.push(...lines);
  if (buffer.length > maxLines) {
    buffer.splice(0, buffer.length - maxLines);
  }
}

function assertStep(condition, label, detail) {
  if (!condition) {
    throw new Error(`${label}: ${sanitize(JSON.stringify(detail)).slice(0, 1600)}`);
  }
}

async function runCommand(command, commandArgs) {
  const output = [];

  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => appendRing(output, chunk));
    child.stderr.on("data", (chunk) => appendRing(output, chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${commandArgs.join(" ")} failed\n${output.join("\n")}`));
    });
  });
}

function startDevServer() {
  const output = [];
  const child = spawn("npm", ["run", "dev", "--", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: projectRoot,
    env: process.env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => appendRing(output, chunk));
  child.stderr.on("data", (chunk) => appendRing(output, chunk));
  child.on("exit", (code) => {
    if (!stoppingDevServer && code !== 0 && code !== null) {
      process.stderr.write(`Next dev server exited with code ${code}\n${output.join("\n")}\n`);
    }
  });

  devServer = child;
}

async function waitForApp(startedAt = Date.now()) {
  while (Date.now() - startedAt < timeoutMs) {
    if (devServer?.exitCode !== null) {
      throw new Error("Next dev server exited before community article E2E completed.");
    }

    try {
      const response = await fetch(appBaseUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error(`Next dev server did not become ready within ${timeoutMs}ms.`);
}

async function stopDevServer() {
  if (!devServer || devServer.exitCode !== null) return;
  stoppingDevServer = true;

  await new Promise((resolve) => {
    devServer.once("exit", resolve);
    try {
      process.kill(-devServer.pid, "SIGTERM");
    } catch {
      devServer.kill("SIGTERM");
    }
    setTimeout(() => {
      if (devServer?.exitCode === null) {
        try {
          process.kill(-devServer.pid, "SIGKILL");
        } catch {
          devServer.kill("SIGKILL");
        }
      }
    }, 3000).unref();
  });
}

function resolveSqlitePath(databaseUrl) {
  if (!databaseUrl?.startsWith("file:")) return null;
  const rawPath = decodeURIComponent(databaseUrl.slice("file:".length));
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(projectRoot, "prisma", rawPath);
}

function assertSafeCleanup(dbPath) {
  const normalized = path.normalize(dbPath);
  const basename = path.basename(normalized).toLowerCase();
  const inProjectPrisma = normalized.startsWith(path.join(projectRoot, "prisma") + path.sep);
  const inTmp = normalized.startsWith(os.tmpdir() + path.sep) || normalized.startsWith("/tmp/");

  if (!basename.includes("e2e")) {
    throw new Error(`임시 E2E DB로 보이지 않아 삭제하지 않습니다: ${normalized}`);
  }

  if (!inProjectPrisma && !inTmp) {
    throw new Error(`안전한 E2E DB 위치가 아니라 삭제하지 않습니다: ${normalized}`);
  }
}

async function cleanupSqliteDb() {
  if (!cleanupDb) return "skipped";
  const dbPath = resolveSqlitePath(process.env.DATABASE_URL);
  if (!dbPath) return "not-sqlite-file-url";

  assertSafeCleanup(dbPath);

  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const target = `${dbPath}${suffix}`;
    if (existsSync(target)) {
      await unlink(target);
    }
  }

  return "cleaned";
}

async function request(method, endpoint, body) {
  const response = await fetch(`${appBaseUrl}${endpoint}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: sanitize(text) };
  }

  return { ok: response.ok, status: response.status, payload };
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function countMatches(patterns, text) {
  return patterns.filter((pattern) => pattern.test(text)).length;
}

function countOccurrences(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return [...text.matchAll(new RegExp(pattern.source, flags))].length;
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?。！？]|다\.|요\.|음\.|함\.)\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function hasPlainIfThen(text) {
  return /\bif\b[\s\S]{0,160}\bthen\b|^\s*if\s+|\bthen\s+|\bif\b[\s\S]{0,160};\s*if\b/im.test(text);
}

function hasBadAssertion(draft) {
  const badPatterns = [
    /제공\s*중단이\s*확정됐다/,
    /Claude\s*Code에서\s*Opus가\s*사라진다/i,
    /공식적으로\s*중단된다/,
  ];
  const exceptionPattern = /안\s*된다|아니다|어렵|금지|말아야|피해야|검수|가정|단정|확인\s*필요|공식\s*확인/;

  return splitSentences(draft).some((sentence) => {
    if (!badPatterns.some((pattern) => pattern.test(sentence))) return false;
    return !exceptionPattern.test(sentence);
  });
}

function hasGitHubOfficialOverclaim(draft) {
  const positivePattern = /공식\s*확인됨|공식적으로\s*확인(?:됐|되었)|확정됐다|확정되었다|공식\s*발표다|공식\s*공지다/i;
  const negationPattern = /아니다|아니며|어렵|보기\s*어려움|보기는\s*어렵|볼\s*수는\s*없|보긴\s*어렵|공식\s*공지(?:가|는)?\s*아님|보강\s*신호|뿐/i;

  return splitSentences(draft).some((sentence) => {
    if (!/GitHub|깃허브|이슈/i.test(sentence)) return false;
    if (!positivePattern.test(sentence)) return false;
    return !negationPattern.test(sentence);
  });
}

function extractH2Titles(markdown) {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.match(/^##\s+(.+?)\s*$/)?.[1]?.replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

function extractParagraphs(markdown) {
  return markdown
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/^#{1,6}\s+.+$/gm, "").trim())
    .map((paragraph) => paragraph.replace(/^[-*]\s+/gm, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function extractClosingPersonalJudgment(markdown) {
  const sentences = splitSentences(markdown).slice(-25);
  return sentences.find((sentence) => personalJudgmentPattern.test(sentence)) ?? "";
}

function extractPublishDecision(reviewReport) {
  const match = reviewReport.match(/발행\s*판단([\s\S]*?)(?:\n#{1,6}\s|\n\d+\.\s|\nP0|\n수정\s*우선순위|$)/);
  return (match?.[1] ?? reviewReport.slice(0, 600)).trim();
}

async function seed(prisma) {
  const profile = await prisma.blogProfile.upsert({
    where: { id: "default" },
    update: {
      blogName: "REFUSE HUB",
      targetAudience: "AI 개발 도구를 실제 블로그 운영에 적용하려는 개인 개발자",
      defaultTone: "과장하지 않고, 확인 필요와 조건 분기를 분명히 쓰는 현실적인 톤",
      preferredStructure: "문제 상황, 커뮤니티 신호, 공식 확인 포인트, 선택 기준, 발행 전 검수",
      forbiddenPhrases: "무조건, 완벽, 끝판왕, 충격, 확정이라고 단정",
      seoRules: "검색자가 실제로 칠 표현을 우선하고, 커뮤니티 신호는 공식 확인 전 검토형으로 쓴다.",
      htmlRules: "h2/h3 중심, 과도한 inline style 금지",
      tooltipRules: "내부 용어는 일반 독자용 표현으로 먼저 풀어쓴다.",
      imagePromptRules: "과장 없는 실무형 이미지",
    },
    create: {
      id: "default",
      blogName: "REFUSE HUB",
      targetAudience: "AI 개발 도구를 실제 블로그 운영에 적용하려는 개인 개발자",
      defaultTone: "과장하지 않고, 확인 필요와 조건 분기를 분명히 쓰는 현실적인 톤",
      preferredStructure: "문제 상황, 커뮤니티 신호, 공식 확인 포인트, 선택 기준, 발행 전 검수",
      forbiddenPhrases: "무조건, 완벽, 끝판왕, 충격, 확정이라고 단정",
      seoRules: "검색자가 실제로 칠 표현을 우선하고, 커뮤니티 신호는 공식 확인 전 검토형으로 쓴다.",
      htmlRules: "h2/h3 중심, 과도한 inline style 금지",
      tooltipRules: "내부 용어는 일반 독자용 표현으로 먼저 풀어쓴다.",
      imagePromptRules: "과장 없는 실무형 이미지",
    },
  });
  const topic = await prisma.topic.create({
    data: {
      rawTopic: "Claude Code Opus Sonnet 차이: Opus 중단설 전에 확인할 작업 기준",
      memo:
        "Opus 중단설에 흔들리기 전에 Claude Code에서 Opus와 Sonnet을 어떤 작업 기준으로 나눠 써야 하는지 정리한다. 공식 확인 전에는 중단을 단정하지 않는다. 글의 핵심은 내부 자동화 구조가 아니라 Opus/Sonnet 선택 기준이다.",
      optionalKeywords: "Claude Code, Claude Opus, Claude Sonnet, Opus Sonnet 차이, Claude Code 모델 선택",
      avoidTopics: "확정되지 않은 루머 단정, 단순 커뮤니티 글 요약, 출처 없는 사용자 의견",
      blogProfileId: profile.id,
    },
  });
  const signal = await prisma.communitySignal.create({
    data: {
      topicId: topic.id,
      sourceType: signalInput.sourceType,
      sourceName: signalInput.sourceName,
      sourceTab: signalInput.sourceTab,
      externalId: "1147981",
      canonicalUrl: signalInput.url,
      title: signalInput.title,
      url: signalInput.url,
      publishedAt: new Date("2026-04-28T09:00:00+09:00"),
      observedAt: new Date("2026-04-28T09:00:00+09:00"),
      score: 758,
      viewCount: 1463,
      commentCount: 27,
      recommendCount: 26,
      summary:
        "DCInside 특이점갤 정보탭에서 관측한 커뮤니티 조기 신호입니다. 공식 출처 확인 전에는 사실로 단정하지 않습니다.",
      signalType: signalInput.signalType,
      riskLevel: signalInput.riskLevel,
      verificationStatus: signalInput.verificationStatus,
      confidence: "low",
      rawMetaJson: JSON.stringify({
        externalId: "1147981",
        sourceTab: signalInput.sourceTab,
        viewCount: 1463,
        commentCount: 27,
        recommendCount: 26,
        metadataOnly: true,
      }),
      linksJson: JSON.stringify([{ title: signalInput.title, url: signalInput.url }]),
      importMethod: "manual_seed",
      status: "success",
    },
  });

  return { profile, topic, signal };
}

async function configureProvider() {
  const auth = await request("POST", "/api/provider-auth/check", {
    mode: providerMode,
    baseUrl: providerBaseUrl,
  });
  assertStep(auth.ok && auth.payload.ok, "provider auth check failed", auth);
  assertStep(auth.payload.status === "authenticated", "provider was not authenticated", auth.payload);
  assertStep(
    Array.isArray(auth.payload.models) && auth.payload.models.includes(providerModel),
    "provider model was not available",
    { model: providerModel, models: auth.payload.models },
  );

  const config = await request("PATCH", "/api/provider-config", {
    mode: providerMode,
    baseUrl: providerBaseUrl,
    model: providerModel,
  });
  assertStep(config.ok && config.payload.config?.model === providerModel, "provider config update failed", config);

  return { status: auth.payload.status, model: config.payload.config.model, modelCount: auth.payload.models.length };
}

async function runE2E() {
  if (process.platform !== "linux") {
    throw new Error("이 E2E는 WSL/Linux 내부에서 실행해야 합니다.");
  }

  assertStep(
    process.env.DATABASE_URL?.startsWith("file:"),
    "DATABASE_URL must be a SQLite file URL for local E2E",
    { DATABASE_URL: process.env.DATABASE_URL ? "set" : "missing" },
  );

  const startedAt = new Date();

  logStep("이전 E2E SQLite DB를 정리합니다.");
  await cleanupSqliteDb();
  logStep("Prisma migration을 적용합니다.");
  await runCommand("npx", ["prisma", "migrate", "deploy"]);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const seeded = await seed(prisma);
  await prisma.$disconnect();

  logStep(`Next dev server를 ${appBaseUrl} 에서 시작합니다.`);
  startDevServer();
  await waitForApp();

  const provider = await configureProvider();
  logStep(`provider authenticated, model=${provider.model}, reasoningEffort=${reasoningEffort}`);

  logStep("CommunitySignal로 TrendCandidate를 생성합니다.");
  const candidateResponse = await request(
    "POST",
    `/api/topics/${seeded.topic.id}/community/signals/${seeded.signal.id}/create-candidate`,
  );
  assertStep(candidateResponse.ok, "community candidate create failed", candidateResponse);
  const candidate = candidateResponse.payload.candidate;
  const sourceMeta = safeJsonParse(candidate.sourceMetaJson ?? "{}", {});

  assertStep(
    ["community_unverified", "community_signal"].includes(candidate.scoringBasis),
    "candidate scoringBasis failed",
    candidate,
  );
  assertStep(candidate.verdict !== "write_now", "community candidate must not be write_now", candidate);
  assertStep(
    ["community_only", "needs_manual_review"].includes(sourceMeta.verificationStatus),
    "sourceMeta verificationStatus failed",
    sourceMeta,
  );
  assertStep(
    sourceMeta.signalTitle === signalInput.title &&
      sourceMeta.signalUrl === signalInput.url &&
      sourceMeta.riskLevel === signalInput.riskLevel &&
      sourceMeta.verificationStatus === signalInput.verificationStatus &&
      !dangerousMarkupPattern.test(JSON.stringify(sourceMeta)),
    "candidate sourceMetaJson failed",
    sourceMeta,
  );

  logStep("GitHub Issues 보강 신호를 연결합니다.");
  const githubBoost = await request("POST", `/api/topics/${seeded.topic.id}/candidates/${candidate.id}/collect-github-issues`);
  assertStep(
    githubBoost.ok &&
      githubBoost.payload.signalCount >= 1 &&
      githubBoost.payload.candidate?.verdict !== "write_now" &&
      githubBoost.payload.signals.every((signal) => signal.verificationStatus === "needs_manual_review"),
    "GitHub Issues boost before article generation failed",
    githubBoost,
  );

  logStep("Post와 outline/draft/review/SEO를 생성합니다.");
  const postResponse = await request("POST", "/api/posts/from-candidate", { candidateId: candidate.id });
  assertStep(postResponse.ok && postResponse.payload.generationStatus === "success", "post create failed", postResponse);
  const postId = postResponse.payload.post.id;

  const outlineResponse = await request("POST", `/api/posts/${postId}/generate-outline`);
  assertStep(
    outlineResponse.ok && outlineResponse.payload.generationStatus === "success",
    "outline generation failed",
    outlineResponse,
  );

  const draftResponse = await request("POST", `/api/posts/${postId}/generate-draft`);
  assertStep(
    draftResponse.ok && draftResponse.payload.generationStatus === "success",
    "draft generation failed",
    draftResponse,
  );

  const reviewResponse = await request("POST", `/api/posts/${postId}/review`);
  assertStep(
    reviewResponse.ok && reviewResponse.payload.generationStatus === "success",
    "review/seo generation failed",
    reviewResponse,
  );

  const finalPost = reviewResponse.payload.post;
  const seoPackage = safeJsonParse(finalPost.seoPackage ?? "{}", {});
  const tags = Array.isArray(seoPackage.tags) ? seoPackage.tags.map((tag) => String(tag)) : [];
  const title = String(finalPost.title ?? "");
  const draft = String(finalPost.draft ?? "");
  const reviewReport = String(finalPost.reviewReport ?? "");
  const metaDescription = String(seoPackage.metaDescription ?? "");
  const publishDecision = extractPublishDecision(reviewReport);
  const h2Titles = extractH2Titles(draft);
  const paragraphs = extractParagraphs(draft);
  const firstParagraph = paragraphs[0] ?? "";
  const firstTwoParagraphs = paragraphs.slice(0, 2).join("\n\n");
  const checkNeededCount = countOccurrences(draft, /확인\s*필요/g);
  const transitionSentenceCount = countOccurrences(draft, transitionSentencePattern);
  const closingPersonalJudgment = extractClosingPersonalJudgment(draft);
  const secondSectionTitle = h2Titles[1] ?? "";
  const rumorSectionIndex = h2Titles.findIndex((sectionTitle, index) => index > 0 && rumorSectionTitlePattern.test(sectionTitle));
  const sourceTagCount = tags.filter((tag) => sourceTagPattern.test(tag)).length;
  const searchIntentTagCount = tags.filter((tag) => searchIntentTagPattern.test(tag)).length;
  const cautionCount = countMatches(draftCautionPatterns, draft);

  logStep("결과 문자열 품질을 검사합니다.");
  assertStep(!titleBadPattern.test(title), "title contains a forbidden certainty expression", { title });
  assertStep(!titleAwkwardRepeatPattern.test(title), "title contains awkward repeated confirmation wording", { title });
  assertStep(titleReviewPattern.test(title), "title should use review-style wording", { title });
  assertStep(titleModelComparisonPattern.test(title) && titleOpusSonnetPattern.test(title), "title should reflect Claude Code Opus/Sonnet comparison", {
    title,
  });
  assertStep(!titleDriftPattern.test(title), "title drifted into replacement tools or blog automation", { title });
  assertStep(realUsageOpeningPattern.test(firstParagraph), "draft opening should start from a concrete usage scene", {
    firstParagraph,
  });
  assertStep(
    modelComparisonConclusionPattern.test(firstTwoParagraphs),
    "draft should state the core Sonnet/Opus conclusion within the first two paragraphs",
    { firstTwoParagraphs },
  );
  assertStep(
    firstSectionConclusionPattern.test(draft.slice(0, 1000)) && modelComparisonConclusionPattern.test(draft),
    "draft should lead with Sonnet default / Opus high failure-cost conclusion",
    { draftPreview: draft.slice(0, 1200) },
  );
  assertStep(h2Titles.length >= 6, "draft should keep the requested model-comparison outline depth", {
    h2Titles,
  });
  assertStep(secondSectionCriteriaPattern.test(secondSectionTitle), "second section should be Opus/Sonnet selection criteria", {
    secondSectionTitle,
    h2Titles,
  });
  assertStep(!secondSectionRumorDriftPattern.test(secondSectionTitle), "second section should not jump into shutdown verification", {
    secondSectionTitle,
    h2Titles,
  });
  assertStep(rumorSectionIndex >= 3, "rumor/shutdown section should appear only after the early model-selection sections", {
    rumorSectionNumber: rumorSectionIndex + 1,
    h2Titles,
  });
  assertStep(checkNeededCount < 3, "draft repeats 확인 필요 too often", {
    checkNeededCount,
    draftPreview: draft.slice(0, 1800),
  });
  assertStep(transitionSentenceCount >= 2, "draft lacks section transition sentences", {
    transitionSentenceCount,
    draftPreview: draft.slice(0, 2400),
  });
  assertStep(cautionCount >= 2, "draft lacks community-signal caution language", {
    cautionCount,
    matched: draftCautionPatterns.filter((pattern) => pattern.test(draft)).map((pattern) => pattern.source),
  });
  assertStep(!draftInternalTermPattern.test(draft), "draft contains internal implementation terms", {
    matchedPattern: draftInternalTermPattern.source,
    draftPreview: draft.slice(0, 1600),
  });
  assertStep(
    communityRumorWatchFailureFixtures.every((fixture) => !draft.includes(fixture)),
    "draft contains a known failing fixture sentence",
    {
      matchedFixtures: communityRumorWatchFailureFixtures.filter((fixture) => draft.includes(fixture)),
    },
  );
  assertStep(!hasPlainIfThen(draft), "draft contains English if/then prose", {
    draftPreview: draft.slice(0, 1600),
  });
  assertStep(!hasBadAssertion(draft), "draft asserts unverified community signal as fact", {
    title,
    draftPreview: draft.slice(0, 1200),
  });
  assertStep(!defensiveAuditPhrasePattern.test(draft), "draft contains defensive audit phrases", {
    draftPreview: draft.slice(0, 1800),
  });
  assertStep(naturalSafetyPhrasePattern.test(draft), "draft lacks natural personal-judgment safety phrasing", {
    draftPreview: draft.slice(0, 1800),
    draftTail: draft.slice(-1800),
  });
  assertStep(
    densityPatternSet.filter((pattern) => pattern.test(draft)).length >= 5,
    "draft lacks model-comparison substance density",
    {
      matched: densityPatternSet.filter((pattern) => pattern.test(draft)).map((pattern) => pattern.source),
      draftPreview: draft.slice(0, 1800),
    },
  );
  assertStep(
    /GitHub|깃허브|이슈/.test(draft) && !hasGitHubOfficialOverclaim(draft),
    "draft should mention GitHub issue reinforcement without treating it as official confirmation",
    { draftPreview: draft.slice(0, 1600) },
  );
  assertStep(personalJudgmentPattern.test(draft), "draft lacks personal judgment or practical response ending", {
    draftTail: draft.slice(-1600),
  });
  assertStep(closingPersonalJudgment.length > 0, "draft ending should include a personal operating judgment", {
    draftTail: draft.slice(-1800),
  });
  assertStep(
    /공식\s*출처\s*확인\s*필요|공식\s*확인\s*필요|공식\s*출처|공식\s*확인/.test(reviewReport),
    "reviewReport does not separate official-source checks",
    { reviewPreview: reviewReport.slice(0, 1200) },
  );
  assertStep(
    /커뮤니티\s*신호.*사실|커뮤니티\s*신호.*단정|사실처럼\s*단정|확정\s*사실처럼\s*쓰지|커뮤니티\s*신호와\s*공식\s*확인.*분리|단정하지|루머를\s*확정하지|community_only|공식\s*확인\s*필요/.test(
      reviewReport,
    ),
    "reviewReport does not warn against factual assertion",
    { reviewPreview: reviewReport.slice(0, 1200) },
  );
  assertStep(
    /수정\s*후\s*발행\s*가능|보류/.test(publishDecision) && !/^바로\s*발행\s*가능/.test(publishDecision),
    "reviewReport publish decision should not be 바로 발행 가능",
    { publishDecision },
  );
  assertStep(metaDescription.length > 0 && metaDescription.length <= 150, "metaDescription length failed", {
    length: metaDescription.length,
    metaDescription,
  });
  assertStep(tags.length >= 8 && tags.length <= 10, "SEO tag count failed", { tags });
  assertStep(!tags.some((tag) => internalTagPattern.test(tag)), "SEO tags contain internal test names", { tags });
  assertStep(sourceTagCount <= 1, "SEO source-name tags are overused", { tags, sourceTagCount });
  assertStep(
    requiredCommunityTagPatterns.every((pattern) => tags.some((tag) => pattern.test(tag))),
    "SEO tags must include Claude Code, Claude Pro, and Opus terms",
    { tags },
  );
  assertStep(searchIntentTagCount >= 3, "SEO tags do not prioritize search-intent terms", {
    tags,
    searchIntentTagCount,
  });

  const tistoryExport = await request("GET", `/api/posts/${postId}/export?format=tistory`);
  const bodyHtml = String(tistoryExport.payload.bodyHtml ?? "");
  assertStep(tistoryExport.ok && bodyHtml.length > 0, "Tistory export failed", tistoryExport);
  assertStep(!bodyHtmlMixedMetadataPattern.test(bodyHtml), "Tistory bodyHtml contains mixed SEO/review metadata", {
    bodyPreview: bodyHtml.slice(0, 1600),
  });
  assertStep(!escapedTistoryTagPattern.test(bodyHtml), "Tistory bodyHtml contains escaped Tistory tags", {
    bodyPreview: bodyHtml.slice(0, 1600),
  });
  assertStep(
    /<p\s+data-ke-size="size16"|<h2\s+data-ke-size="size26"/.test(bodyHtml),
    "Tistory bodyHtml does not contain expected rendered Tistory tags",
    { bodyPreview: bodyHtml.slice(0, 1600) },
  );

  const prismaAfter = new PrismaClient();
  const [savedSignal, savedCandidate, logs] = await Promise.all([
    prismaAfter.communitySignal.findUnique({ where: { id: seeded.signal.id } }),
    prismaAfter.trendCandidate.findUnique({ where: { id: candidate.id } }),
    prismaAfter.generationLog.findMany({
      where: {
        createdAt: {
          gte: startedAt,
        },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  await prismaAfter.$disconnect();

  assertStep(savedSignal?.candidateId === candidate.id, "CommunitySignal candidate relation failed", savedSignal);
  assertStep(
    savedCandidate?.sourceMetaJson && !dangerousMarkupPattern.test(savedCandidate.sourceMetaJson),
    "saved sourceMetaJson safety failed",
    savedCandidate,
  );
  assertStep(
    savedSignal?.rawMetaJson && !dangerousMarkupPattern.test(savedSignal.rawMetaJson),
    "CommunitySignal rawMetaJson safety failed",
    savedSignal,
  );

  const logByAction = new Map(logs.map((log) => [log.action, log]));
  const editorialLog = logByAction.get("writer_editorial_pass");
  const missingActions = requiredLogActions.filter((action) => !logByAction.has(action));
  const nonSuccessLogs = logs
    .filter((log) => requiredLogActions.includes(log.action))
    .filter((log) => log.generationStatus !== "success" || log.status !== "success");
  assertStep(missingActions.length === 0, "generation logs are missing", { missingActions, logs });
  assertStep(nonSuccessLogs.length === 0, "generation logs are not success", {
    nonSuccessLogs: nonSuccessLogs.map((log) => ({
      action: log.action,
      status: log.status,
      generationStatus: log.generationStatus,
      errorMessage: log.errorMessage,
    })),
  });
  assertStep(
    /editorialPass=(used|reverted_to_original|safe_fallback_used)/.test(editorialLog?.outputSummary ?? ""),
    "writer_editorial_pass log should record selected fallback path",
    { outputSummary: editorialLog?.outputSummary },
  );

  return {
    provider,
    reasoningEffort,
    topicId: seeded.topic.id,
    postId,
    candidate: {
      keyword: candidate.keyword,
      verdict: candidate.verdict,
      scoringBasis: candidate.scoringBasis,
      totalScore: candidate.totalScore,
      verificationStatus: sourceMeta.verificationStatus,
      riskLevel: sourceMeta.riskLevel,
      sourceMetaJsonSafe: true,
      githubBoostSignalCount: githubBoost.payload.signalCount,
    },
    article: {
      title,
      titleReviewStyle: titleReviewPattern.test(title),
      titleStayedOnRumorTopic: !titleDriftPattern.test(title),
      firstParagraph: firstParagraph.slice(0, 300),
      conclusionInFirstTwoParagraphs: modelComparisonConclusionPattern.test(firstTwoParagraphs),
      checkNeededCount,
      draftCautionMatchCount: cautionCount,
      draftInternalTermsRemoved: true,
      draftPlainIfThenRemoved: true,
      transitionSentenceCount,
      secondSectionTitle,
      rumorSectionNumber: rumorSectionIndex + 1,
      personalJudgmentIncluded: true,
      closingPersonalJudgment: closingPersonalJudgment.slice(0, 300),
      editorialPass: editorialLog?.outputSummary ?? "",
      draftBadAssertion: false,
      reviewDecision: publishDecision.slice(0, 180),
    },
    seo: {
      metaDescriptionLength: metaDescription.length,
      tagCount: tags.length,
      sourceTagCount,
      searchIntentTagCount,
      tags,
    },
    tistoryExport: {
      bodyHtmlLength: bodyHtml.length,
      bodyHtmlHasMixedMetadata: false,
      bodyHtmlHasEscapedTags: false,
    },
    generationLogs: requiredLogActions.map((action) => ({
      action,
      generationStatus: logByAction.get(action)?.generationStatus,
      status: logByAction.get(action)?.status,
      outputSummary: action === "writer_editorial_pass" ? logByAction.get(action)?.outputSummary : undefined,
    })),
  };
}

try {
  const result = await runE2E();
  await stopDevServer();
  const cleanupStatus = await cleanupSqliteDb();

  console.log(
    JSON.stringify(
      {
        ok: true,
        ...result,
        cleanupDb: cleanupStatus,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await stopDevServer();
  await cleanupSqliteDb().catch(() => undefined);
  console.error(sanitize(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
