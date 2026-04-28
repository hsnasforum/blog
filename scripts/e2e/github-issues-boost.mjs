import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const require = createRequire(import.meta.url);
const port = Number(process.env.E2E_GITHUB_ISSUES_BOOST_PORT ?? 3036);
const appBaseUrl = `http://127.0.0.1:${port}`;
const timeoutMs = Number(process.env.E2E_TIMEOUT_MS ?? 180_000);
const databaseUrl = process.env.DATABASE_URL?.includes("e2e")
  ? process.env.DATABASE_URL
  : "file:./github-issues-boost-e2e.db";

process.env.DATABASE_URL = databaseUrl;
process.env.GITHUB_TOKEN = "";
process.env.GITHUB_ISSUES_COLLECTOR_MODE = "mock";

require.extensions[".ts"] = (module, filename) => {
  const ts = require("typescript");
  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  module._compile(output, filename);
};

let devServer = null;
let stoppingDevServer = false;

function logStep(message) {
  console.log(`[github-issues-boost] ${message}`);
}

function sanitize(raw) {
  return String(raw)
    .replace(/authorization["']?\s*:\s*["']?bearer\s+[^"',\s}]+/gi, "authorization: [redacted]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/GITHUB_TOKEN=[^,\s]+/gi, "GITHUB_TOKEN=[redacted]");
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
    if (devServer?.exitCode !== null) {
      throw new Error("Next dev server exited before GitHub Issues boost smoke completed.");
    }

    try {
      const response = await fetch(appBaseUrl, { signal: AbortSignal.timeout(1000) });
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
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };
    devServer.once("exit", finish);
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
      finish();
    }, 3000).unref();
    setTimeout(finish, 5000).unref();
  });
  stoppingDevServer = false;
  devServer = null;
}

function resolveSqlitePath(url) {
  if (!url?.startsWith("file:")) return null;
  const rawPath = decodeURIComponent(url.slice("file:".length));
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

async function seed(prisma) {
  const profile = await prisma.blogProfile.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      blogName: "REFUSE HUB",
      targetAudience: "AI 개발 도구를 실제 블로그 운영에 적용하려는 개인 개발자",
      defaultTone: "공식 확인과 커뮤니티 신호를 구분하는 현실적인 톤",
      preferredStructure: "커뮤니티 신호, 보강 신호, 공식 확인 포인트, 발행 전 검수",
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
      memo: "DCInside 조기 신호를 GitHub Issues로 보강할 수 있는지 검증한다.",
      optionalKeywords: "Claude Code, Claude Pro, Opus, AI 코딩 도구, 모델 제공 중단",
      avoidTopics: "확정되지 않은 루머 단정, 출처 없는 사용자 의견",
      blogProfileId: profile.id,
    },
  });

  const createSignal = (externalId, suffix = "") =>
    prisma.communitySignal.create({
      data: {
        topicId: topic.id,
        sourceType: "dcinside",
        sourceName: "DCInside 특이점갤 정보탭",
        sourceTab: "info",
        externalId,
        canonicalUrl:
          "https://gall.dcinside.com/mgallery/board/view/?id=thesingularity&no=1147981&search_head=10&page=1",
        title: suffix
          ? `클로드 프로, 클코에 오푸스 제공 중단 예정 ${suffix}`
          : "클로드 프로, 클코에 오푸스 제공 중단 예정",
        url: "https://gall.dcinside.com/mgallery/board/view/?id=thesingularity&no=1147981&search_head=10&page=1",
        publishedAt: new Date("2026-04-28T09:00:00+09:00"),
        score: 758,
        viewCount: 1463,
        commentCount: 27,
        recommendCount: 26,
        summary: "DCInside 특이점갤 정보탭에서 관측한 커뮤니티 조기 신호입니다.",
        signalType: "service_change",
        riskLevel: "medium",
        verificationStatus: "community_only",
        confidence: "low",
        rawMetaJson: JSON.stringify({ externalId, metadataOnly: true }),
        linksJson: JSON.stringify([{ title: "클로드 프로, 클코에 오푸스 제공 중단 예정", url: "https://gall.dcinside.com" }]),
        importMethod: "manual_seed",
      },
    });

  const sourceSignal = await createSignal("1147981");
  const emptySignal = await createSignal("1147981-empty", "결과 없음 케이스");
  return { topic, sourceSignal, emptySignal };
}

function assertGitHubQuerySplit() {
  const collectorSource = readFileSync(
    path.join(projectRoot, "lib/community/collectors/github/github-issues-collector.ts"),
    "utf8",
  );
  const mapperSource = readFileSync(path.join(projectRoot, "lib/community/github-query-mapper.ts"), "utf8");
  const typeSource = readFileSync(path.join(projectRoot, "lib/community/collectors/github/github-types.ts"), "utf8");
  const source = `${collectorSource}\n${mapperSource}\n${typeSource}`;
  for (const facet of ["bug", "regression", "breaking change", "pricing", "billing", "api", "documentation"]) {
    assertStep(source.includes(facet), "GitHub issue facet query missing", { facet });
  }
  assertStep(
    collectorSource.includes("buildGitHubIssueSearchQueries") && !collectorSource.includes(" OR "),
    "GitHub query split failed",
    {},
  );
}

function assertGitHubQueryMapperSamples() {
  const { mapCommunityTitleToGitHubQueries } = require(
    path.join(projectRoot, "lib/community/github-query-mapper.ts"),
  );
  const samples = [
    {
      input: "클로드 프로, 클코에 오푸스 제공 중단 예정",
      expected: [
        "Claude Code Opus availability",
        "Claude Code model availability",
        "Claude Max usage limit",
        "Claude Code subscription limit",
        "Claude Code Opus",
      ],
    },
    {
      input: "코덱스 1M컨텍 곧 지원할것",
      expected: ["Codex 1M context", "OpenAI Codex context window", "Codex long context", "1M context"],
      forbidden: ["Mcontext"],
    },
    {
      input: "코파일럿 정액제->종량제로 변경",
      expected: [
        "GitHub Copilot premium requests",
        "GitHub Copilot usage limit",
        "GitHub Copilot metered premium requests",
        "GitHub Copilot billing",
        "GitHub Copilot subscription limit",
        "GitHub Copilot Pro billing",
      ],
    },
    {
      input: "100만 컨텍 지원",
      expected: ["1M context"],
      forbidden: ["Mcontext"],
    },
  ];

  for (const sample of samples) {
    const result = mapCommunityTitleToGitHubQueries(sample.input);
    for (const expected of sample.expected) {
      assertStep(result.queries.includes(expected), "GitHub query mapper sample failed", {
        input: sample.input,
        expected,
        queries: result.queries,
      });
    }
    for (const forbidden of sample.forbidden ?? []) {
      assertStep(!result.queries.some((query) => query.includes(forbidden)), "GitHub query mapper forbidden term found", {
        input: sample.input,
        forbidden,
        queries: result.queries,
      });
    }
    if (sample.input.includes("코파일럿")) {
      assertStep(
        result.queries.indexOf("Copilot pricing") > result.queries.indexOf("GitHub Copilot Pro billing"),
        "Copilot pricing should be lower priority than precise billing queries",
        result.queries,
      );
    }
    if (sample.input.includes("클로드")) {
      assertStep(
        result.queries.indexOf("Claude Code") > result.queries.indexOf("Claude Code subscription limit"),
        "Claude Code single query should be lower priority than availability/limit queries",
        result.queries,
      );
    }
  }
}

async function createCandidate(topicId, signalId) {
  const response = await request("POST", `/api/topics/${topicId}/community/signals/${signalId}/create-candidate`);
  assertStep(response.ok, "community signal candidate create failed", response);
  return response.payload.candidate;
}

async function runE2E() {
  if (process.platform !== "linux") throw new Error("이 E2E는 WSL/Linux 내부에서 실행해야 합니다.");
  assertGitHubQuerySplit();
  assertGitHubQueryMapperSamples();
  await cleanupSqliteDb();
  await runCommand("npx", ["prisma", "migrate", "deploy"]);

  const prisma = new PrismaClient();
  const seeded = await seed(prisma);
  await prisma.$disconnect();

  logStep("mock GitHub Issues 결과가 있는 서버를 시작합니다.");
  startDevServer();
  await waitForApp();

  const candidate = await createCandidate(seeded.topic.id, seeded.sourceSignal.id);
  assertStep(candidate.verdict !== "write_now", "DCInside-only candidate must not be write_now", candidate);
  const beforeScore = candidate.totalScore;
  const boost = await request(
    "POST",
    `/api/topics/${seeded.topic.id}/candidates/${candidate.id}/collect-github-issues`,
  );
  assertStep(boost.ok && boost.payload.signalCount === 2, "GitHub issue boost should save deduped signals", boost);
  assertStep(boost.payload.warnings?.some((warning) => warning.includes("GITHUB_TOKEN")), "missing token warning failed", boost);

  const githubSignals = boost.payload.signals.filter((signal) => signal.sourceType === "github_issues");
  const urls = new Set(githubSignals.map((signal) => signal.url));
  const first = githubSignals[0];
  const meta = JSON.parse(first.rawMetaJson ?? "{}");
  assertStep(githubSignals.length === urls.size, "GitHub issue dedupe failed", githubSignals);
  assertStep(
    first.verificationStatus === "needs_manual_review" &&
      first.confidence === "medium" &&
      first.externalId === "anthropics/claude-code#42" &&
      first.canonicalUrl === "https://github.com/anthropics/claude-code/issues/42" &&
      meta.repository === "anthropics/claude-code" &&
      meta.issueNumber === 42 &&
      meta.comments === 18 &&
      meta.reactionsTotalCount === 7 &&
      meta.searchQuery === "Claude Code Opus availability" &&
      Array.isArray(meta.matchedQueries) &&
      meta.matchedQueries.includes("Claude Code model availability") &&
      typeof meta.relevanceScore === "number" &&
      meta.relevanceScore >= 55 &&
      Array.isArray(meta.labels) &&
      meta.createdAt &&
      meta.updatedAt &&
      meta.metadataOnly === true &&
      !/body|commentBody|rawHtml|originalHtml|<script|<iframe|onerror|javascript:/i.test(JSON.stringify(first)),
    "GitHub issue signal metadata failed",
    { first, meta },
  );
  assertStep(
    boost.payload.candidate.verdict !== "write_now" &&
      boost.payload.candidate.confidence === "medium" &&
      boost.payload.candidate.totalScore >= beforeScore &&
      boost.payload.candidate.scoringReason?.includes("GitHub Issues 보강 신호"),
    "GitHub boost score reflection failed",
    { beforeScore, candidate: boost.payload.candidate },
  );

  const trendsPage = await fetch(`${appBaseUrl}/topics/${seeded.topic.id}/trends`).then((response) => response.text());
  assertStep(
    trendsPage.includes("GitHub Issues 보강 신호") &&
      trendsPage.includes("anthropics/claude-code") &&
      trendsPage.includes("Claude Code Opus model unavailable after billing change") &&
      trendsPage.includes("comments") &&
      trendsPage.includes("18") &&
      trendsPage.includes("reactions") &&
      trendsPage.includes("7") &&
      trendsPage.includes("검색어:") &&
      trendsPage.includes("Claude Code Opus availability") &&
      trendsPage.includes("relevance") &&
      trendsPage.includes("GitHub 이슈 보강 신호입니다. 공식 repo 여부와 문서/릴리즈 확인이 필요할 수 있습니다."),
    "GitHub issue UI display failed",
    { preview: trendsPage.slice(0, 2200) },
  );

  logStep("mock GitHub Issues 결과 없음 처리를 확인합니다.");
  const emptyCandidate = await createCandidate(seeded.topic.id, seeded.emptySignal.id);
  const emptyBefore = {
    scoringBasis: emptyCandidate.scoringBasis,
    verdict: emptyCandidate.verdict,
    totalScore: emptyCandidate.totalScore,
    confidence: emptyCandidate.confidence,
  };
  const emptyBoost = await request(
    "POST",
    `/api/topics/${seeded.topic.id}/candidates/${emptyCandidate.id}/collect-github-issues`,
  );
  assertStep(
    emptyBoost.ok &&
      emptyBoost.payload.collectionStatus === "failed" &&
      emptyBoost.payload.signalCount === 0 &&
      /관련 GitHub Issue를 찾지 못했습니다/.test(emptyBoost.payload.warning ?? "") &&
      emptyBoost.payload.candidate.verdict === emptyBefore.verdict &&
      emptyBoost.payload.candidate.scoringBasis === emptyBefore.scoringBasis &&
      emptyBoost.payload.candidate.totalScore === emptyBefore.totalScore &&
      emptyBoost.payload.candidate.confidence === emptyBefore.confidence &&
      emptyBoost.payload.candidate.communitySignals.every((signal) => signal.sourceType !== "github_issues"),
    "GitHub issue empty result handling failed",
    { emptyBefore, emptyBoost },
  );

  return {
    topicId: seeded.topic.id,
    boostedCandidate: {
      keyword: candidate.keyword,
      beforeScore,
      afterScore: boost.payload.candidate.totalScore,
      verdict: boost.payload.candidate.verdict,
      confidence: boost.payload.candidate.confidence,
      githubSignalCount: githubSignals.length,
    },
    firstGitHubSignal: {
      externalId: first.externalId,
      canonicalUrl: first.canonicalUrl,
      verificationStatus: first.verificationStatus,
      confidence: first.confidence,
      repository: meta.repository,
      issueNumber: meta.issueNumber,
      commentCount: first.commentCount,
      reactionCount: first.reactionCount,
      searchQuery: meta.searchQuery,
      relevanceScore: meta.relevanceScore,
    },
    emptyResultCandidate: emptyBefore,
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
