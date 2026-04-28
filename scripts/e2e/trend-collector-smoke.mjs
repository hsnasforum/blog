import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const port = Number(process.env.E2E_TREND_PORT ?? 3031);
const appBaseUrl = `http://127.0.0.1:${port}`;
process.env.DATABASE_URL ||= "file:./trend-e2e.db";
process.env.TREND_COLLECTOR_MODE = "mock";

let devServer = null;
let stoppingDevServer = false;

function logStep(message) {
  console.log(`[trend-smoke] ${message}`);
}

function sanitize(raw) {
  return String(raw)
    .replace(/authorization["']?\s*:\s*["']?bearer\s+[^"',\s}]+/gi, "authorization: [redacted]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/NAVER_CLIENT_SECRET=[^,\s]+/gi, "NAVER_CLIENT_SECRET=[redacted]");
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
    throw new Error(`${label}: ${sanitize(JSON.stringify(detail)).slice(0, 1200)}`);
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

async function waitForApp(timeoutMs = 120_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (devServer?.exitCode !== null) {
      throw new Error("Next dev server exited before trend smoke completed.");
    }

    try {
      const response = await fetch(appBaseUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error("Next dev server did not become ready for trend smoke.");
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

async function request(method, endpoint) {
  const response = await fetch(`${appBaseUrl}${endpoint}`, { method });
  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: sanitize(text) };
  }

  return { ok: response.ok, status: response.status, payload };
}

async function seedTrendSmokeData(prisma) {
  const profile = await prisma.blogProfile.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      blogName: "REFUSE HUB",
      targetAudience: "개인 개발자와 블로그 운영자",
      defaultTone: "현실적인 장단점과 조건 분기 중심",
      preferredStructure: "문제, 선택 기준, 실패 사례, 검수 체크리스트",
      forbiddenPhrases: "무조건, 완벽, 끝판왕",
      seoRules: "검색 의도와 한계를 함께 설명",
      htmlRules: "h2/h3 중심",
      tooltipRules: "전문 용어는 짧게 설명",
      imagePromptRules: "과장 없는 실무형 이미지",
    },
  });
  const topic = await prisma.topic.create({
    data: {
      rawTopic: "AI",
      memo: "블로그 자동화용 기술 스택과 Codex OAuth 프록시를 비교하고 싶다.",
      optionalKeywords: "블로그 자동화, Codex OAuth, ChatGPT API",
      avoidTopics: "단순 뉴스 요약, 근거 없는 루머, 너무 일반적인 AI 소개글",
      blogProfileId: profile.id,
    },
  });
  await prisma.trendCandidate.createMany({
    data: [
      {
        topicId: topic.id,
        keyword: "블로그 자동화용 기술 스택 선택",
        rationale: "실무 선택 기준과 실패 사례로 확장 가능한 후보",
        titleCandidates: JSON.stringify(["블로그 자동화용 기술 스택 선택 기준"]),
        scoringBasis: "estimated_without_external_data",
        searchGrowthScore: 22,
        newsVelocityScore: 12,
        communityHeatScore: 12,
        blogFitScore: 14,
        differentiationScore: 9,
        lifespanScore: 5,
        riskPenalty: 0,
        totalScore: 74,
        verdict: "review_first",
        confidence: "medium",
        scoringVersion: "v2",
      },
      {
        topicId: topic.id,
        keyword: "단순 AI 소개글",
        rationale: "너무 일반적인 후보",
        titleCandidates: JSON.stringify(["AI 소개"]),
        scoringBasis: "estimated_without_external_data",
        searchGrowthScore: 10,
        newsVelocityScore: 6,
        communityHeatScore: 6,
        blogFitScore: 5,
        differentiationScore: 1,
        lifespanScore: 2,
        riskPenalty: -8,
        totalScore: 22,
        verdict: "reject",
        confidence: "low",
        scoringVersion: "v2",
      },
    ],
  });

  return topic;
}

try {
  assertStep(process.platform === "linux", "trend smoke must run in WSL/Linux", { platform: process.platform });
  logStep("Prisma migration을 적용합니다.");
  await runCommand("npx", ["prisma", "migrate", "deploy"]);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const topic = await seedTrendSmokeData(prisma);
  await prisma.$disconnect();

  logStep(`Next dev server를 ${appBaseUrl} 에서 시작합니다.`);
  startDevServer();
  await waitForApp();

  logStep("mock collector로 외부 신호 수집 API를 호출합니다.");
  const collected = await request("POST", `/api/topics/${topic.id}/collect-trends`);
  assertStep(collected.ok, "collect-trends failed", collected);
  assertStep(collected.payload.collectionStatus === "success", "collection status failed", collected.payload);
  assertStep(
    collected.payload.candidates.some(
      (candidate) => candidate.scoringBasis === "external_data" && candidate.verdict === "write_now",
    ),
    "external_data write_now candidate missing",
    collected.payload.candidates,
  );
  assertStep(
    collected.payload.candidates.every((candidate) =>
      candidate.scoringBasis === "external_data" ? candidate.totalScore >= 0 : candidate.verdict !== "write_now",
    ),
    "write_now should only come from external_data",
    collected.payload.candidates,
  );

  const prismaAfter = new PrismaClient();
  const signalCount = await prismaAfter.trendSignal.count({
    where: { candidate: { topicId: topic.id } },
  });
  const successLog = await prismaAfter.generationLog.findFirst({
    where: { action: "collectTrendSignals", generationStatus: "success" },
    orderBy: { createdAt: "desc" },
  });
  await prismaAfter.$disconnect();

  assertStep(signalCount === 6, "trend signal count failed", { signalCount });
  assertStep(Boolean(successLog), "generation log missing", { successLog });
  await stopDevServer();
  const cleanupDb = await cleanupSqliteDb();

  console.log(
    JSON.stringify(
      {
        ok: true,
        topicId: topic.id,
        collectionStatus: collected.payload.collectionStatus,
        candidates: collected.payload.candidates.map((candidate) => ({
          keyword: candidate.keyword,
          totalScore: candidate.totalScore,
          verdict: candidate.verdict,
          scoringBasis: candidate.scoringBasis,
          confidence: candidate.confidence,
        })),
        signalCount,
        cleanupDb,
      },
      null,
      2,
    ),
  );
} catch (error) {
  await stopDevServer();
  console.error(sanitize(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
