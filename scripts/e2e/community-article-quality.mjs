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
  "reviewDraft",
  "generateSeoPackage",
];
const dangerousMarkupPattern = /rawHtml|originalHtml|<tr|<script|<iframe|onerror|javascript:/i;
const titleBadPattern =
  /클로드\s*프로,\s*클코\s*오푸스\s*제공\s*중단\s*확정|오푸스\s*제공\s*중단\s*확정|Claude\s*Code\s*Opus\s*중단\s*확정/i;
const titleReviewPattern = /중단설|공식\s*확인\s*전|체크할\s*것|확인해야\s*할\s*점|검토/i;
const draftCautionPatterns = [
  /커뮤니티\s*조기\s*신호/,
  /공식\s*확인/,
  /확인\s*필요/,
  /단정하기\s*어렵/,
  /검토/,
  /출처\s*확인/,
];
const internalTagPattern = /provider\s*success\s*e2e|generationlog/i;
const sourceTagPattern = /dcinside|디씨|특이점갤/i;
const searchIntentTagPattern =
  /Claude\s*Code|Claude\s*Pro|Opus|오푸스|AI\s*코딩\s*도구|모델\s*제공\s*중단|개발자\s*요금제|AI\s*도구\s*검토|클로드|클코/i;

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

function splitSentences(text) {
  return text
    .split(/(?<=[.!?。！？]|다\.|요\.|음\.|함\.)\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
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
      rawTopic: "Claude Code Opus 제공 중단 커뮤니티 신호",
      memo:
        "DCInside 특이점갤에서 Claude Pro와 Claude Code의 Opus 제공 중단 예정 이야기가 올라왔지만 공식 확인 전이므로 검토형 글감으로 다룬다.",
      optionalKeywords: "Claude Code, Claude Pro, Opus, AI 코딩 도구, 모델 제공 중단",
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
  const sourceTagCount = tags.filter((tag) => sourceTagPattern.test(tag)).length;
  const searchIntentTagCount = tags.filter((tag) => searchIntentTagPattern.test(tag)).length;
  const cautionCount = countMatches(draftCautionPatterns, draft);

  logStep("결과 문자열 품질을 검사합니다.");
  assertStep(!titleBadPattern.test(title), "title contains a forbidden certainty expression", { title });
  assertStep(titleReviewPattern.test(title), "title should use review-style wording", { title });
  assertStep(cautionCount >= 2, "draft lacks community-signal caution language", {
    cautionCount,
    matched: draftCautionPatterns.filter((pattern) => pattern.test(draft)).map((pattern) => pattern.source),
  });
  assertStep(!hasBadAssertion(draft), "draft asserts unverified community signal as fact", {
    title,
    draftPreview: draft.slice(0, 1200),
  });
  assertStep(
    /GitHub|깃허브|이슈/.test(draft) &&
      !/GitHub[^.\n]{0,80}(공식\s*확인됨|공식적으로\s*확인|확정)/i.test(draft),
    "draft should mention GitHub issue reinforcement without treating it as official confirmation",
    { draftPreview: draft.slice(0, 1600) },
  );
  assertStep(
    /공식\s*출처\s*확인\s*필요|공식\s*확인\s*필요|공식\s*출처|공식\s*확인/.test(reviewReport),
    "reviewReport does not separate official-source checks",
    { reviewPreview: reviewReport.slice(0, 1200) },
  );
  assertStep(
    /커뮤니티\s*신호.*사실|커뮤니티\s*신호.*단정|사실처럼\s*단정|단정하지|루머를\s*확정하지|community_only|공식\s*확인\s*필요/.test(
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
  assertStep(searchIntentTagCount >= 3, "SEO tags do not prioritize search-intent terms", {
    tags,
    searchIntentTagCount,
  });

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
      draftCautionMatchCount: cautionCount,
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
    generationLogs: requiredLogActions.map((action) => ({
      action,
      generationStatus: logByAction.get(action)?.generationStatus,
      status: logByAction.get(action)?.status,
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
