import { spawn } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const port = Number(process.env.E2E_COMPARE_PORT ?? 3033);
const appBaseUrl = `http://127.0.0.1:${port}`;
process.env.DATABASE_URL ||= "file:./quality-compare-e2e.db";
const debugLogPath = path.join(projectRoot, "scripts/e2e/model-quality-compare-debug.log");

const variants = [
  {
    key: "A",
    label: "gpt-5.4-mini / medium",
    model: "gpt-5.4-mini",
    reasoningEffort: "medium",
  },
  {
    key: "B",
    label: "gpt-5.5 / xhigh",
    model: "gpt-5.5",
    reasoningEffort: "xhigh",
  },
];

let devServer = null;
let stoppingDevServer = false;
let lastDevServerOutput = [];

function debug(message) {
  appendFileSync(debugLogPath, `${new Date().toISOString()} ${message}\n`);
}

process.on("exit", (code) => {
  debug(`process exit code=${code}`);
});

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(signal, () => {
    debug(`process signal=${signal}`);
  });
}

process.on("uncaughtException", (error) => {
  debug(`uncaughtException=${error instanceof Error ? error.stack ?? error.message : String(error)}`);
});

process.on("unhandledRejection", (error) => {
  debug(`unhandledRejection=${error instanceof Error ? error.stack ?? error.message : String(error)}`);
});

function logStep(message) {
  console.log(`[quality-compare] ${message}`);
}

function sanitize(raw) {
  const apiKey = process.env.OPENAI_API_KEY;
  let text = String(raw);
  if (apiKey) text = text.split(apiKey).join("[redacted-api-key]");
  return text
    .replace(/authorization["']?\s*:\s*["']?bearer\s+[^"',\s}]+/gi, "authorization: [redacted]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer [redacted]");
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

async function runCommand(command, commandArgs, env = process.env) {
  const output = [];
  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: projectRoot,
      env,
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

function startDevServer(env) {
  const output = [];
  lastDevServerOutput = output;
  stoppingDevServer = false;
  const child = spawn("npm", ["run", "dev", "--", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: projectRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
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

async function waitForApp(timeoutMs = 120_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (devServer?.exitCode !== null) throw new Error("Next dev server exited before compare completed.");
    try {
      const response = await fetch(appBaseUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("Next dev server did not become ready for compare.");
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
  if (process.env.E2E_CLEANUP_DB !== "1") return "skipped";
  const dbPath = resolveSqlitePath(process.env.DATABASE_URL);
  if (!dbPath) return "not-sqlite-file-url";
  assertSafeCleanup(dbPath);
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const target = `${dbPath}${suffix}`;
    if (existsSync(target)) await unlink(target);
  }
  return "cleaned";
}

async function seedCompareData(prisma) {
  const profile = await prisma.blogProfile.upsert({
    where: { id: "default" },
    update: {
      blogName: "REFUSE HUB",
      targetAudience: "개인 개발자와 블로그 운영자",
      defaultTone: "과장 없이 현실적인 장단점과 조건 분기 중심. 가능하지만 조건이 있다는 식으로 판단한다.",
      preferredStructure:
        "실제 고민에서 시작하고, 선택 기준, 실패 사례, 조건 분기, 검수 체크리스트, 자동 작성과 자동 발행 구분을 포함한다.",
      forbiddenPhrases: "무조건, 완벽, 끝판왕, 혁신적, 대부분의 경우, 핵심 판단에만 집중",
      seoRules: "검색 의도와 한계를 함께 설명하고 클릭베이트를 피한다.",
      htmlRules: "h2/h3 중심으로 읽기 쉽게 구성한다.",
      tooltipRules: "전문 용어는 짧게 설명한다.",
      imagePromptRules: "과장 없는 실무형 이미지",
    },
    create: {
      id: "default",
      blogName: "REFUSE HUB",
      targetAudience: "개인 개발자와 블로그 운영자",
      defaultTone: "과장 없이 현실적인 장단점과 조건 분기 중심. 가능하지만 조건이 있다는 식으로 판단한다.",
      preferredStructure:
        "실제 고민에서 시작하고, 선택 기준, 실패 사례, 조건 분기, 검수 체크리스트, 자동 작성과 자동 발행 구분을 포함한다.",
      forbiddenPhrases: "무조건, 완벽, 끝판왕, 혁신적, 대부분의 경우, 핵심 판단에만 집중",
      seoRules: "검색 의도와 한계를 함께 설명하고 클릭베이트를 피한다.",
      htmlRules: "h2/h3 중심으로 읽기 쉽게 구성한다.",
      tooltipRules: "전문 용어는 짧게 설명한다.",
      imagePromptRules: "과장 없는 실무형 이미지",
    },
  });
  const topic = await prisma.topic.create({
    data: {
      rawTopic: "AI",
      memo:
        "ChatGPT 구독과 API, Codex OAuth 프록시, 블로그 자동 작성기, AI 에이전트 자동화 중에서 지금 블로그에 쓸 만한 글감을 찾고 싶다.",
      optionalKeywords: "ChatGPT API, Codex OAuth, AI 에이전트, 블로그 자동화, 로컬 LLM",
      avoidTopics: "단순 뉴스 요약, 근거 없는 루머, 너무 일반적인 AI 소개글",
      blogProfileId: profile.id,
    },
  });
  const candidate = await prisma.trendCandidate.create({
    data: {
      topicId: topic.id,
      keyword: "블로그 자동화용 기술 스택 선택",
      rationale:
        "개인용 로컬 블로그 자동 작성기에서 provider, DB, workflow, export를 어떻게 나눌지 판단하는 실무형 후보입니다.",
      angleRecommendation:
        "자동 작성과 자동 발행을 구분하고, 로컬 도구 기준에서 Next.js/Prisma/SQLite/provider 구조를 선택하는 기준을 정리한다.",
      titleCandidates: JSON.stringify([
        "블로그 자동화용 기술 스택 선택 기준",
        "자동 작성기 MVP에서 먼저 나눠야 할 기술 선택",
        "로컬 블로그 자동 작성기 스택을 고르는 법",
      ]),
      scoringBasis: "estimated_without_external_data",
      searchGrowthScore: 24,
      newsVelocityScore: 13,
      communityHeatScore: 14,
      blogFitScore: 15,
      differentiationScore: 9,
      lifespanScore: 5,
      riskPenalty: 0,
      totalScore: 79,
      verdict: "review_first",
      confidence: "medium",
      scoringVersion: "v2",
      scoringReason: "비교 평가용 고정 후보입니다.",
      recommendationReason: "검토 후 작성 추천",
      isRecommended: true,
    },
  });
  return { profile, topic, candidate };
}

function parseSeoPackage(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (!match) return { raw };
    try {
      return JSON.parse(match[1]);
    } catch {
      return { raw };
    }
  }
}

function textStats(text) {
  return {
    chars: (text ?? "").length,
    words: (text ?? "").split(/\s+/).filter(Boolean).length,
  };
}

function countMatches(text, patterns) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text ?? "") ? 1 : 0), 0);
}

function evaluate(result) {
  const draft = result.post.draft ?? "";
  const reviewReport = result.post.reviewReport ?? "";
  const seo = parseSeoPackage(result.post.seoPackage);
  const metaDescription = String(seo.metaDescription ?? seo.description ?? "");
  const tags = Array.isArray(seo.tags) ? seo.tags.map(String) : [];
  const title = String(seo.seoTitle ?? seo.title ?? "");
  const p0Count = (reviewReport.match(/\bP0\b/g) ?? []).length;
  const p1Count = (reviewReport.match(/\bP1\b/g) ?? []).length;
  const p2Count = (reviewReport.match(/\bP2\b/g) ?? []).length;

  return {
    draft: {
      ...textStats(draft),
      startsWithConcreteProblem: !/^(AI는|자동화는|최근 AI|요즘 AI)/.test(draft.trim()),
      conditionalSignals: countMatches(draft, [/라면/g, /이면/g, /경우/g, /반면/g, /대신/g]),
      failureSignals: countMatches(draft, [/실패/g, /문제/g, /막히/g, /오류/g, /fallback/g, /approved/g]),
      directVsExternalSignals: countMatches(draft, [/내 환경에서는/g, /이번 테스트에서는/g, /외부 반응/g, /커뮤니티/g, /확인 필요/g]),
      hypeSignals: countMatches(draft, [/무조건/g, /완벽/g, /끝판왕/g, /혁신적/g]),
      internalTermSignals: countMatches(draft, [/WriterService/g, /TrendCandidate/g, /GenerationLog/g, /approval guard/g, /oauth-proxy/g]),
    },
    review: {
      ...textStats(reviewReport),
      p0Count,
      p1Count,
      p2Count,
      hasFactCheckSection: /사실 확인|확인 필요|정책|가격|API|보안/.test(reviewReport),
      hasAlternativeSentences: /대체 문장|수정 방향|예시/.test(reviewReport),
      hasInternalLinks: /내부링크|관련 글/.test(reviewReport),
    },
    seo: {
      title,
      metaDescription,
      tags,
      metaLength: metaDescription.length,
      tagCount: tags.length,
      broadTagCount: tags.filter((tag) => ["AI", "SEO", "자동화"].includes(tag)).length,
      clickbaitSignals: countMatches(`${title} ${metaDescription}`, [/무조건/g, /완벽/g, /끝판왕/g, /충격/g]),
    },
  };
}

async function runVariant(seeded, variant) {
  const env = {
    ...process.env,
    WRITER_PROVIDER: "oauth-proxy",
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:10531/v1",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "dummy-for-local-proxy",
    WRITER_MODEL: variant.model,
    WRITER_REASONING_EFFORT: variant.reasoningEffort,
    DATABASE_URL: process.env.DATABASE_URL,
  };
  logStep(`${variant.label} 서버를 시작합니다.`);
  startDevServer(env);
  await waitForApp();

  const config = await request("PATCH", "/api/provider-config", {
    mode: "oauth-proxy",
    baseUrl: env.OPENAI_BASE_URL,
    model: variant.model,
  });
  assertStep(config.ok, `${variant.label} provider config failed`, config);

  const prisma = new PrismaClient();
  const post = await prisma.post.create({
    data: {
      topicId: seeded.topic.id,
      candidateId: seeded.candidate.id,
      blogProfileId: seeded.profile.id,
      title: `${seeded.candidate.keyword} (${variant.key})`,
      angle: seeded.candidate.angleRecommendation,
      workflowStep: "outline",
    },
  });
  await prisma.$disconnect();

  const timings = {};
  const statuses = {};

  for (const step of [
    ["outline", `/api/posts/${post.id}/generate-outline`],
    ["draft", `/api/posts/${post.id}/generate-draft`],
    ["review", `/api/posts/${post.id}/review`],
  ]) {
    const [name, endpoint] = step;
    const startedAt = Date.now();
    const response = await request("POST", endpoint);
    timings[name] = Date.now() - startedAt;
    statuses[name] = response.payload.generationStatus ?? "unknown";
    assertStep(response.ok && response.payload.generationStatus === "success", `${variant.label} ${name} failed`, response);
  }

  await stopDevServer();

  const prismaAfter = new PrismaClient();
  const saved = await prismaAfter.post.findUnique({ where: { id: post.id } });
  const logs = await prismaAfter.generationLog.findMany({
    where: {
      model: variant.model,
      createdAt: { gte: post.createdAt },
    },
    orderBy: { createdAt: "asc" },
  });
  await prismaAfter.$disconnect();
  assertStep(saved?.draft && saved.reviewReport && saved.seoPackage, `${variant.label} post persistence failed`, saved);

  return {
    variant,
    post: saved,
    timings,
    totalMs: Object.values(timings).reduce((sum, value) => sum + value, 0),
    statuses,
    logs: logs.map((log) => ({
      action: log.action,
      model: log.model,
      generationStatus: log.generationStatus,
      inputSummary: log.inputSummary,
      errorMessage: log.errorMessage,
    })),
    evaluation: evaluate({ post: saved }),
  };
}

try {
  assertStep(process.platform === "linux", "quality compare must run in WSL/Linux", { platform: process.platform });
  logStep("Prisma migration을 적용합니다.");
  await runCommand("npx", ["prisma", "migrate", "deploy"]);
  const prisma = new PrismaClient();
  const seeded = await seedCompareData(prisma);
  await prisma.$disconnect();

  const results = [];
  for (const variant of variants) {
    try {
      results.push(await runVariant(seeded, variant));
    } finally {
      await stopDevServer();
    }
  }

  const output = {
    ok: true,
    topicId: seeded.topic.id,
    candidateId: seeded.candidate.id,
    candidateKeyword: seeded.candidate.keyword,
    results,
  };
  const outPath = path.join(projectRoot, "scripts/e2e/model-quality-compare-result.json");
  await writeFile(outPath, JSON.stringify(output, null, 2));
  const cleanupDb = await cleanupSqliteDb();
  console.log(JSON.stringify({ ok: true, resultPath: outPath, cleanupDb }, null, 2));
} catch (error) {
  await stopDevServer();
  const message = sanitize(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
  await writeFile(
    path.join(projectRoot, "scripts/e2e/model-quality-compare-error.log"),
    `${message}\n\n--- dev server output ---\n${lastDevServerOutput.join("\n")}`,
  );
  console.error(message);
  process.exitCode = 1;
}
