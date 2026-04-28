import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.DATABASE_URL ||= "file:./kospi-user-opinion-e2e.db";

const { PrismaClient } = await import("@prisma/client");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const prisma = new PrismaClient();
const port = Number(process.env.E2E_KOSPI_PORT ?? 3035);
const appBaseUrl = `http://127.0.0.1:${port}`;
const providerMode = process.env.WRITER_PROVIDER === "api-key" ? "api-key" : "oauth-proxy";
const providerBaseUrl = process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:10531/v1";
const cleanupDb = process.env.E2E_CLEANUP_DB === "1";
const resultPath = path.join(projectRoot, "scripts/e2e/kospi-user-opinion-regression-result.json");
const timeoutMs = Number(process.env.E2E_TIMEOUT_MS ?? 180_000);

let devServer = null;
let stoppingDevServer = false;

function logStep(message) {
  console.log(`[kospi-opinion] ${message}`);
}

function sanitize(raw) {
  let text = typeof raw === "string" ? raw : JSON.stringify(raw);
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) text = text.split(apiKey).join("[redacted-api-key]");
  return text
    .replace(/authorization["']?\s*:\s*["']?bearer\s+[^"',\s}]+/gi, "authorization: [redacted]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/access_token["']?\s*[:=]\s*["']?[^"',\s}]+/gi, "access_token: [redacted]")
    .replace(/refresh_token["']?\s*[:=]\s*["']?[^"',\s}]+/gi, "refresh_token: [redacted]")
    .replace(/auth\.json/gi, "[redacted-auth-file]");
}

function appendRing(buffer, chunk, maxLines = 100) {
  const lines = sanitize(chunk.toString()).split(/\r?\n/).filter(Boolean);
  buffer.push(...lines);
  if (buffer.length > maxLines) buffer.splice(0, buffer.length - maxLines);
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
  stoppingDevServer = false;
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

async function stopDevServer() {
  if (!devServer || devServer.exitCode !== null) return;
  stoppingDevServer = true;
  await new Promise((resolve) => {
    const serverPid = devServer.pid;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    devServer.once("exit", finish);
    if (serverPid) {
      try {
        process.kill(-serverPid, "SIGTERM");
      } catch {
        devServer.kill("SIGTERM");
      }
    } else {
      devServer.kill("SIGTERM");
    }
    const timeout = setTimeout(() => {
      if (devServer?.exitCode === null && serverPid) {
        try {
          process.kill(-serverPid, "SIGKILL");
        } catch {
          devServer.kill("SIGKILL");
        }
      }
      finish();
    }, 3000);
    devServer.once("exit", () => clearTimeout(timeout));
  });
}

async function waitForApp(startedAt = Date.now()) {
  while (Date.now() - startedAt < timeoutMs) {
    if (devServer?.exitCode !== null) throw new Error("Next dev server exited before KOSPI regression completed.");
    try {
      const response = await fetch(appBaseUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`Next dev server did not become ready within ${timeoutMs}ms.`);
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

function resolveSqlitePath(databaseUrl) {
  if (!databaseUrl?.startsWith("file:")) return null;
  const rawPath = decodeURIComponent(databaseUrl.slice("file:".length));
  if (!rawPath) return null;
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
  if (!cleanupDb) return "skipped";
  const dbPath = resolveSqlitePath(process.env.DATABASE_URL);
  if (!dbPath) return "not-sqlite-file-url";
  assertSafeCleanup(dbPath);
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const target = `${dbPath}${suffix}`;
    if (existsSync(target)) await unlink(target);
  }
  return "cleaned";
}

async function configureProvider() {
  const auth = await request("POST", "/api/provider-auth/check", {
    mode: providerMode,
    baseUrl: providerBaseUrl,
  });
  assertStep(auth.ok && auth.payload.ok, "provider auth check failed", auth);

  const models = Array.isArray(auth.payload.models) ? auth.payload.models : [];
  assertStep(models.length > 0, "provider returned no models", auth.payload);
  const selectedModel = process.env.WRITER_MODEL && models.includes(process.env.WRITER_MODEL)
    ? process.env.WRITER_MODEL
    : models[0];

  const config = await request("PATCH", "/api/provider-config", {
    mode: providerMode,
    baseUrl: providerBaseUrl,
    model: selectedModel,
  });
  assertStep(config.ok, "provider config update failed", config);
  return selectedModel;
}

function findForbiddenDraftSignals(draft) {
  const patterns = [
    /외부\s*사용자\s*의견은[^.\n]*(다루지|별도|제공되지|없)/i,
    /사용자\s*의견(?:은|이)?[^.\n]*(없|제공되지|별도|확인 필요)/i,
    /Reddit|Hacker\s*News|국내\s*커뮤니티|증권\s*앱\s*리뷰|GitHub\s*Issues|Stack\s*Exchange/i,
    /커뮤니티\s*반응(?:은|이)?[^.\n]*(제공되지|없|확인 필요)/i,
  ];
  return patterns
    .map((pattern) => {
      const match = draft.match(pattern);
      return match?.[0] ?? null;
    })
    .filter(Boolean);
}

function lastParagraphHasPersonalJudgment(draft) {
  const paragraphs = draft.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  const tail = paragraphs.slice(-3).join("\n\n");
  return /(내\s*판단|개인적(?:인)?\s*판단|점검\s*원칙|확인\s*순서|기준|원칙|마무리|정리)/.test(tail);
}

async function runRegression() {
  if (process.platform !== "linux") throw new Error("이 E2E는 WSL/Linux 내부에서 실행해야 합니다.");
  assertStep(process.env.DATABASE_URL?.startsWith("file:"), "DATABASE_URL must be a SQLite file URL", {
    DATABASE_URL: process.env.DATABASE_URL ? "set" : "missing",
  });

  logStep("Prisma migration을 적용합니다.");
  await runCommand("npx", ["prisma", "migrate", "deploy"]);
  logStep(`Next dev server를 ${appBaseUrl} 에서 시작합니다.`);
  startDevServer();
  await waitForApp();

  const selectedModel = await configureProvider();
  logStep(`provider 연결 성공, model=${selectedModel}`);

  const topic = await request("POST", "/api/topics", {
    rawTopic: "코스피",
    memo:
      "코스피를 단정적인 전망이나 특정 종목 추천이 아니라 개인 투자자가 스스로 점검할 원칙으로 정리하고 싶다. 외부 사용자 의견 출처는 제공하지 않았다.",
    optionalKeywords: "코스피, 금리, 환율, 반도체, 개인 투자자, 리스크 관리",
    avoidTopics: "단정적 매수/매도 추천, 근거 없는 루머, 특정 종목 추천, 출처 없는 사용자 후기",
  });
  assertStep(topic.ok, "topic create failed", topic);

  const candidate = await prisma.trendCandidate.create({
    data: {
      topicId: topic.payload.topic.id,
      keyword: "코스피 하락장에서 개인 투자자가 점검할 기준",
      rationale: "코스피를 맞히는 글이 아니라 투자자가 확인해야 할 조건과 리스크 관리 기준을 정리하는 글감입니다.",
      angleRecommendation: "가격 전망보다 금리, 환율, 업종 쏠림, 투자 기간, 현금 비중 같은 점검 항목 중심으로 구성",
      titleCandidates: JSON.stringify([
        "코스피를 볼 때 먼저 점검할 기준",
        "코스피 하락장에서 개인 투자자가 확인할 것",
        "코스피 전망보다 중요한 투자 점검 원칙",
      ]),
      scoringBasis: "estimated_without_external_data",
      totalScore: 69,
      verdict: "review_first",
      confidence: "medium",
      scoringVersion: "v2",
      scoringReason: "외부 데이터 없이 입력과 글감 적합도만으로 계산한 추정 점수입니다.",
      isRecommended: true,
      searchGrowthScore: 20,
      newsVelocityScore: 13,
      communityHeatScore: 12,
      blogFitScore: 12,
      differentiationScore: 8,
      lifespanScore: 4,
      riskPenalty: 0,
    },
  });

  const post = await request("POST", "/api/posts/from-candidate", { candidateId: candidate.id });
  assertStep(post.ok && post.payload.generationStatus === "success", "post create failed", post);
  const postId = post.payload.post.id;

  const outline = await request("POST", `/api/posts/${postId}/generate-outline`);
  assertStep(outline.ok && outline.payload.generationStatus === "success", "outline failed", outline);

  const draft = await request("POST", `/api/posts/${postId}/generate-draft`);
  assertStep(draft.ok && draft.payload.generationStatus === "success", "draft failed", draft);

  const review = await request("POST", `/api/posts/${postId}/review`);
  assertStep(review.ok && review.payload.generationStatus === "success", "review failed", review);

  const saved = await prisma.post.findUnique({ where: { id: postId } });
  assertStep(Boolean(saved?.draft && saved.reviewReport), "saved post missing draft or review", saved);

  const forbiddenSignals = findForbiddenDraftSignals(saved.draft);
  assertStep(forbiddenSignals.length === 0, "draft contains defensive user-opinion/source listing", {
    forbiddenSignals,
    draftPreview: saved.draft.slice(0, 1200),
  });
  assertStep(lastParagraphHasPersonalJudgment(saved.draft), "draft ending does not look like a personal judgment/check principle", {
    tail: saved.draft.slice(-1200),
  });

  const logs = await prisma.generationLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  const actions = new Set(["generateAngle", "generateOutline", "generateDraft", "reviewDraft"]);
  const runLogs = logs.filter((log) => actions.has(log.action));
  assertStep(
    runLogs.length >= actions.size && runLogs.every((log) => log.generationStatus === "success"),
    "generation logs are not all success",
    runLogs.map((log) => ({
      action: log.action,
      generationStatus: log.generationStatus,
      model: log.model,
    })),
  );

  const result = {
    ok: true,
    model: selectedModel,
    postId,
    draftLength: saved.draft.length,
    reviewLength: saved.reviewReport.length,
    forbiddenSignals,
    endingPreview: saved.draft.slice(-500),
    generationStatuses: {
      createPost: post.payload.generationStatus,
      outline: outline.payload.generationStatus,
      draft: draft.payload.generationStatus,
      review: review.payload.generationStatus,
    },
  };

  await writeFile(resultPath, JSON.stringify(result, null, 2));
  return result;
}

try {
  const result = await runRegression();
  await stopDevServer();
  await prisma.$disconnect();
  const cleanupStatus = await cleanupSqliteDb();
  console.log(JSON.stringify({ ...result, cleanupDb: cleanupStatus }, null, 2));
} catch (error) {
  await stopDevServer();
  await prisma.$disconnect();
  console.error(sanitize(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
