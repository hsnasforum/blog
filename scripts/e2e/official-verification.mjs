import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const port = Number(process.env.E2E_OFFICIAL_VERIFICATION_PORT ?? 3035);
const appBaseUrl = `http://127.0.0.1:${port}`;
const providerMode = "oauth-proxy";
const providerBaseUrl = process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:10531/v1";
const providerModel = process.env.WRITER_MODEL ?? "gpt-5.5";
const reasoningEffort = process.env.WRITER_REASONING_EFFORT ?? "xhigh";

process.env.DATABASE_URL ||= "file:./official-verification-e2e.db";
process.env.WRITER_PROVIDER = providerMode;
process.env.OPENAI_BASE_URL = providerBaseUrl;
process.env.OPENAI_API_KEY ||= "dummy-for-local-proxy";
process.env.WRITER_MODEL = providerModel;
process.env.WRITER_REASONING_EFFORT = reasoningEffort;

const timeoutMs = Number(process.env.E2E_TIMEOUT_MS ?? 240_000);
const communityTitle = "클로드 프로, 클코에 오푸스 제공 중단 예정";
const communityUrl =
  "https://gall.dcinside.com/mgallery/board/view/?id=thesingularity&no=1147981&search_head=10&page=1";
const officialUrl = "https://docs.anthropic.com/en/docs/about-claude/models";
const officialTitle = "Anthropic 공식 모델 제공 안내";
const badAssertionPattern =
  /제공\s*중단이\s*확정됐다|Claude\s*Code에서\s*Opus가\s*사라진다|공식적으로\s*중단된다/i;
const communityCautionPattern = /커뮤니티\s*조기\s*신호|공식\s*확인\s*필요|단정하기\s*어렵|검토|출처\s*확인/;
const officialDraftPattern = /공식\s*(출처|문서|안내|원문|확인)/;
const dangerousStoredPattern = /rawHtml|originalHtml|<tr|<script|<iframe|onerror|javascript:/i;

let devServer = null;
let stoppingDevServer = false;

function logStep(message) {
  console.log(`[official-verification] ${message}`);
}

function sanitize(raw) {
  let text = typeof raw === "string" ? raw : JSON.stringify(raw);
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) text = text.split(apiKey).join("[redacted-api-key]");
  return text
    .replace(/authorization["']?\s*:\s*["']?bearer\s+[^"',\s}]+/gi, "authorization: [redacted]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/access_token["']?\s*[:=]\s*["']?[^"',\s}]+/gi, "access_token: [redacted]")
    .replace(/refresh_token["']?\s*[:=]\s*["']?[^"',\s}]+/gi, "refresh_token: [redacted]");
}

function appendRing(buffer, chunk, maxLines = 80) {
  const lines = sanitize(chunk.toString()).split(/\r?\n/).filter(Boolean);
  buffer.push(...lines);
  if (buffer.length > maxLines) buffer.splice(0, buffer.length - maxLines);
}

function assertStep(condition, label, detail) {
  if (!condition) {
    throw new Error(`${label}: ${sanitize(JSON.stringify(detail)).slice(0, 1800)}`);
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
      if (code === 0) resolve();
      else reject(new Error(`${command} ${commandArgs.join(" ")} failed\n${output.join("\n")}`));
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
    if (devServer?.exitCode !== null) throw new Error("Next dev server exited before E2E completed.");
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
  if (!basename.includes("e2e")) throw new Error(`임시 E2E DB로 보이지 않아 삭제하지 않습니다: ${normalized}`);
  if (!inProjectPrisma && !inTmp) throw new Error(`안전한 E2E DB 위치가 아니라 삭제하지 않습니다: ${normalized}`);
}

async function cleanupSqliteDb() {
  const dbPath = resolveSqlitePath(process.env.DATABASE_URL);
  if (!dbPath) return "not-sqlite-file-url";
  assertSafeCleanup(dbPath);
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const target = `${dbPath}${suffix}`;
    if (existsSync(target)) await unlink(target);
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

async function requestText(endpoint) {
  const response = await fetch(`${appBaseUrl}${endpoint}`);
  return { ok: response.ok, status: response.status, text: await response.text() };
}

function safeJsonParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function seed(prisma) {
  const profile = await prisma.blogProfile.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      blogName: "REFUSE HUB",
      targetAudience: "AI 개발 도구를 실제 블로그 운영에 적용하려는 개인 개발자",
      defaultTone: "공식 확인과 커뮤니티 신호를 구분하는 현실적인 톤",
      preferredStructure: "커뮤니티 신호, 공식 출처 확인, 판단 기준, 발행 전 검수",
      forbiddenPhrases: "무조건, 완벽, 끝판왕, 확정이라고 단정",
      seoRules: "공개 검색어 중심, 공식 확인 전에는 검토형 표현 사용",
      htmlRules: "h2/h3 중심",
      tooltipRules: "전문 용어는 짧게 설명",
      imagePromptRules: "과장 없는 실무형 이미지",
    },
  });
  const topic = await prisma.topic.create({
    data: {
      rawTopic: "Claude Code Opus 제공 중단 커뮤니티 신호",
      memo: "공식 출처 URL을 수동으로 붙여 커뮤니티 신호 검증 상태를 올리는 흐름을 테스트한다.",
      optionalKeywords: "Claude Code, Claude Pro, Opus, AI 코딩 도구, 모델 제공 중단",
      avoidTopics: "확정되지 않은 루머 단정, 출처 없는 사용자 의견",
      blogProfileId: profile.id,
    },
  });
  const createSignal = (riskLevel, suffix = "") =>
    prisma.communitySignal.create({
      data: {
        topicId: topic.id,
        sourceType: "dcinside",
        sourceName: "DCInside 특이점갤 정보탭",
        sourceTab: "info",
        externalId: `1147981${suffix}`,
        canonicalUrl: communityUrl,
        title: suffix ? `${communityTitle} ${suffix}` : communityTitle,
        url: communityUrl,
        score: 758,
        viewCount: 1463,
        commentCount: 27,
        recommendCount: 26,
        summary: "커뮤니티 조기 신호입니다. 공식 확인 전에는 사실로 단정하지 않습니다.",
        signalType: "service_change",
        riskLevel,
        verificationStatus: "community_only",
        confidence: "low",
        rawMetaJson: JSON.stringify({ externalId: `1147981${suffix}`, metadataOnly: true }),
        linksJson: JSON.stringify([{ title: communityTitle, url: communityUrl }]),
        importMethod: "manual_seed",
      },
    });
  const mediumSignal = await createSignal("medium");
  const lowSignal = await createSignal("low", "-low");
  return { topic, mediumSignal, lowSignal };
}

async function configureProvider() {
  const auth = await request("POST", "/api/provider-auth/check", {
    mode: providerMode,
    baseUrl: providerBaseUrl,
  });
  assertStep(auth.ok && auth.payload.ok, "provider auth check failed", auth);
  assertStep(auth.payload.models?.includes(providerModel), "provider model missing", auth.payload);
  const config = await request("PATCH", "/api/provider-config", {
    mode: providerMode,
    baseUrl: providerBaseUrl,
    model: providerModel,
  });
  assertStep(config.ok && config.payload.config?.model === providerModel, "provider config failed", config);
  return { status: auth.payload.status, model: providerModel, modelCount: auth.payload.models.length };
}

async function createCandidateFromSignal(topicId, signalId) {
  const response = await request("POST", `/api/topics/${topicId}/community/signals/${signalId}/create-candidate`);
  assertStep(response.ok, "candidate from signal failed", response);
  return response.payload.candidate;
}

async function addOfficialSource(topicId, candidateId, communitySignalId, verificationStatus, title = officialTitle) {
  const response = await request("POST", `/api/topics/${topicId}/candidates/${candidateId}/official-sources`, {
    communitySignalId,
    sourceType: "official_doc",
    title,
    url: officialUrl,
    note: "공식 문서 URL을 수동으로 확인한 출처입니다. 원문 전체는 저장하지 않습니다.",
    verificationStatus,
  });
  assertStep(response.ok, "official source add failed", response);
  return response.payload;
}

async function runArticleFlow(candidateId) {
  const post = await request("POST", "/api/posts/from-candidate", { candidateId });
  assertStep(post.ok && post.payload.generationStatus === "success", "post create failed", post);
  const postId = post.payload.post.id;
  const outline = await request("POST", `/api/posts/${postId}/generate-outline`);
  assertStep(outline.ok && outline.payload.generationStatus === "success", "outline failed", outline);
  const draft = await request("POST", `/api/posts/${postId}/generate-draft`);
  assertStep(draft.ok && draft.payload.generationStatus === "success", "draft failed", draft);
  return { postId, draft: draft.payload.post.draft };
}

async function runE2E() {
  if (process.platform !== "linux") throw new Error("이 E2E는 WSL/Linux 내부에서 실행해야 합니다.");
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

  logStep("기본 community_unverified 후보를 확인합니다.");
  const mediumCandidate = await createCandidateFromSignal(seeded.topic.id, seeded.mediumSignal.id);
  const mediumSourceMeta = safeJsonParse(mediumCandidate.sourceMetaJson ?? "{}", {});
  assertStep(
    mediumCandidate.scoringBasis === "community_unverified" &&
      mediumCandidate.verdict === "review_first" &&
      mediumCandidate.verdict !== "write_now" &&
      mediumSourceMeta.verificationStatus === "community_only",
    "initial community candidate state failed",
    { mediumCandidate, mediumSourceMeta },
  );

  logStep("공식 확인 전 draft 표현을 확인합니다.");
  const beforeArticle = await runArticleFlow(mediumCandidate.id);
  assertStep(communityCautionPattern.test(beforeArticle.draft), "community-only draft lacks caution language", {
    draftPreview: beforeArticle.draft.slice(0, 1200),
  });
  assertStep(!badAssertionPattern.test(beforeArticle.draft), "community-only draft asserts the signal as fact", {
    draftPreview: beforeArticle.draft.slice(0, 1200),
  });

  logStep("medium risk 후보에 공식 출처를 추가합니다.");
  const officialMedium = await addOfficialSource(
    seeded.topic.id,
    mediumCandidate.id,
    seeded.mediumSignal.id,
    "official_confirmed",
  );
  const confirmedMeta = safeJsonParse(officialMedium.candidate.sourceMetaJson ?? "{}", {});
  assertStep(
    officialMedium.candidate.verdict === "review_first" &&
      officialMedium.candidate.scoringBasis === "community_signal" &&
      confirmedMeta.verificationStatus === "official_confirmed",
    "medium official confirmation should remain review_first",
    { officialMedium, confirmedMeta },
  );

  const trendsPage = await requestText(`/topics/${seeded.topic.id}/trends`);
  assertStep(
    trendsPage.ok &&
      trendsPage.text.includes("공식 출처 확인됨") &&
      trendsPage.text.includes(officialTitle) &&
      trendsPage.text.includes(officialUrl.replaceAll("&", "&amp;")) &&
      trendsPage.text.includes("공식 확인 전에는 사실로 단정하지 마세요."),
    "official source UI display failed",
    { preview: trendsPage.text.slice(0, 1800) },
  );

  logStep("공식 출처 추가 후 draft 표현 변화를 확인합니다.");
  const afterDraft = await request("POST", `/api/posts/${beforeArticle.postId}/generate-draft`);
  assertStep(afterDraft.ok && afterDraft.payload.generationStatus === "success", "official draft regeneration failed", afterDraft);
  assertStep(officialDraftPattern.test(afterDraft.payload.post.draft), "official-confirmed draft lacks official-source language", {
    draftPreview: afterDraft.payload.post.draft.slice(0, 1200),
  });
  assertStep(!badAssertionPattern.test(afterDraft.payload.post.draft), "official-confirmed draft overasserts the signal", {
    draftPreview: afterDraft.payload.post.draft.slice(0, 1200),
  });

  logStep("low risk + official_confirmed write_now 가능 여부를 확인합니다.");
  const lowCandidate = await createCandidateFromSignal(seeded.topic.id, seeded.lowSignal.id);
  const officialLow = await addOfficialSource(
    seeded.topic.id,
    lowCandidate.id,
    seeded.lowSignal.id,
    "official_confirmed",
    "Anthropic 공식 low risk 확인 출처",
  );
  assertStep(
    officialLow.candidate.verdict === "write_now" &&
      officialLow.candidate.scoringBasis === "community_signal",
    "low risk official confirmation should allow write_now",
    officialLow.candidate,
  );

  logStep("contradicted 상태가 reject로 반영되는지 확인합니다.");
  const contradicted = await addOfficialSource(
    seeded.topic.id,
    mediumCandidate.id,
    seeded.mediumSignal.id,
    "contradicted",
    "Anthropic 공식 반박 출처",
  );
  assertStep(
    contradicted.candidate.verdict === "reject" &&
      contradicted.candidate.riskPenalty === -30,
    "contradicted official source should reject candidate",
    contradicted.candidate,
  );

  const prismaAfter = new PrismaClient();
  const [officialSources, savedSignal, savedCandidate] = await Promise.all([
    prismaAfter.officialSource.findMany({ where: { candidateId: mediumCandidate.id } }),
    prismaAfter.communitySignal.findUnique({ where: { id: seeded.mediumSignal.id } }),
    prismaAfter.trendCandidate.findUnique({ where: { id: mediumCandidate.id } }),
  ]);
  await prismaAfter.$disconnect();
  assertStep(officialSources.length >= 2, "official sources were not saved", officialSources);
  assertStep(
    officialSources.every((source) => !dangerousStoredPattern.test(JSON.stringify(source))),
    "official sources should store only URL/title/note metadata",
    officialSources,
  );
  assertStep(savedSignal?.verificationStatus === "contradicted", "CommunitySignal verificationStatus not synced", savedSignal);
  assertStep(
    savedCandidate?.sourceMetaJson && safeJsonParse(savedCandidate.sourceMetaJson, {}).verificationStatus === "contradicted",
    "sourceMetaJson verificationStatus not synced",
    savedCandidate,
  );

  return {
    provider,
    reasoningEffort,
    topicId: seeded.topic.id,
    mediumCandidate: {
      keyword: mediumCandidate.keyword,
      before: {
        verdict: mediumCandidate.verdict,
        scoringBasis: mediumCandidate.scoringBasis,
        verificationStatus: mediumSourceMeta.verificationStatus,
      },
      officialConfirmed: {
        verdict: officialMedium.candidate.verdict,
        scoringBasis: officialMedium.candidate.scoringBasis,
        verificationStatus: confirmedMeta.verificationStatus,
      },
      contradicted: {
        verdict: contradicted.candidate.verdict,
        riskPenalty: contradicted.candidate.riskPenalty,
      },
    },
    lowRiskOfficialCandidate: {
      verdict: officialLow.candidate.verdict,
      scoringBasis: officialLow.candidate.scoringBasis,
      totalScore: officialLow.candidate.totalScore,
    },
    draftChecks: {
      beforeHasCommunityCaution: true,
      afterHasOfficialSourceLanguage: true,
      badAssertion: false,
    },
    officialSourceCount: officialSources.length,
  };
}

try {
  const result = await runE2E();
  await stopDevServer();
  const cleanupDb = await cleanupSqliteDb();
  console.log(JSON.stringify({ ok: true, ...result, cleanupDb }, null, 2));
} catch (error) {
  await stopDevServer();
  await cleanupSqliteDb().catch(() => undefined);
  console.error(sanitize(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
