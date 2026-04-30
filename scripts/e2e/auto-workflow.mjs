import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const port = Number(process.env.E2E_AUTO_WORKFLOW_PORT ?? 3039);
const appBaseUrl = `http://127.0.0.1:${port}`;
const timeoutMs = Number(process.env.E2E_TIMEOUT_MS ?? 240_000);

process.env.DATABASE_URL ??= "file:./auto-workflow-e2e.db";
process.env.TREND_COLLECTOR_MODE ??= "mock";
process.env.COMMUNITY_COLLECTOR_MODE ??= "mock";
process.env.GITHUB_ISSUES_COLLECTOR_MODE ??= "mock";

const prisma = new PrismaClient();
let devServer = null;
let stoppingDevServer = false;

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

function log(message) {
  console.log(`[auto-workflow] ${message}`);
}

function appendRing(buffer, chunk, maxLines = 80) {
  const lines = sanitize(chunk.toString()).split(/\r?\n/).filter(Boolean);
  buffer.push(...lines);
  if (buffer.length > maxLines) buffer.splice(0, buffer.length - maxLines);
}

function assertStep(condition, label, detail) {
  if (!condition) {
    throw new Error(`${label}: ${sanitize(JSON.stringify(detail)).slice(0, 1600)}`);
  }
}

async function runCommand(command, args) {
  const output = [];
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (chunk) => appendRing(output, chunk));
    child.stderr.on("data", (chunk) => appendRing(output, chunk));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} failed\n${output.join("\n")}`));
    });
  });
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
  if (!inProjectPrisma && !inTmp) throw new Error(`안전한 E2E DB 위치가 아닙니다: ${normalized}`);
}

async function cleanupSqliteDb() {
  const dbPath = resolveSqlitePath(process.env.DATABASE_URL);
  if (!dbPath) return;
  assertSafeCleanup(dbPath);
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const target = `${dbPath}${suffix}`;
    if (existsSync(target)) await unlink(target);
  }
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
  });
}

async function waitForApp(startedAt = Date.now()) {
  while (Date.now() - startedAt < timeoutMs) {
    if (devServer?.exitCode !== null) throw new Error("Next dev server exited before Auto Workflow E2E completed.");
    try {
      const response = await fetch(appBaseUrl, { signal: AbortSignal.timeout(1000) });
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

async function seedBlogProfile() {
  await prisma.blogProfile.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      blogName: "REFUSE HUB",
      targetAudience: "AI 개발 도구와 블로그 자동화를 실제로 써보는 초보~중급 개발자",
      defaultTone: "명확하고 현실적인 존댓말. 검수 문서처럼 쓰지 않고 개인 판단을 자연스럽게 포함한다.",
      preferredStructure: "답부터 시작하고 실제 사용 상황, 확인 기준, 개인 판단으로 마무리한다.",
      forbiddenPhrases: "무조건, 완벽, if then, WriterService, GenerationLog, provider success E2E",
      seoRules: "검색자가 실제로 입력할 표현을 우선하고 내부 구현명 태그를 피한다.",
      htmlRules: "티스토리 본문 HTML에는 제목, 메타 설명, 태그, 검수 리포트를 섞지 않는다.",
      tooltipRules: "낯선 용어는 짧게 설명한다.",
      imagePromptRules: "실제 작업 맥락의 스크린샷형 이미지를 우선한다.",
    },
  });
}

function chooseCandidate(candidates) {
  return (
    candidates.find((candidate) => candidate.verdict === "review_first") ??
    candidates.find((candidate) => candidate.verdict === "hold") ??
    candidates[0]
  );
}

async function main() {
  try {
    if (process.env.E2E_CLEANUP_DB === "1") {
      await cleanupSqliteDb();
    }
    log("prisma migrate deploy");
    await runCommand("npx", ["prisma", "migrate", "deploy"]);
    await seedBlogProfile();

    log("start dev server");
    startDevServer();
    await waitForApp();

    log("Topic 생성 + Auto Scout 실행");
    const topicResponse = await request("POST", "/api/topics", {
      rawTopic: "AI",
      memo: "AI 자동화, Claude Code, Codex, 블로그 자동 작성 중 오늘 쓸 만한 글감을 찾는다.",
      optionalKeywords: "Claude Code, Codex, 블로그 자동화, AI 코딩 도구, ChatGPT",
      avoidTopics: "단순 뉴스 요약, 근거 없는 루머, 너무 일반적인 AI 소개글",
      autoScout: true,
    });
    assertStep(topicResponse.ok, "Topic 생성 API 실패", topicResponse);
    assertStep(topicResponse.payload.autoScout, "autoScout 응답 없음", topicResponse.payload);
    assertStep(topicResponse.payload.autoScout.candidateCount > 0, "Auto Scout 후보 생성 실패", topicResponse.payload.autoScout);
    assertStep(
      ["success", "partial"].includes(topicResponse.payload.autoScout.status),
      "Auto Scout 상태가 success/partial이 아님",
      topicResponse.payload.autoScout,
    );

    const topicId = topicResponse.payload.topic.id;
    const candidates = await prisma.trendCandidate.findMany({
      where: { topicId },
      orderBy: [{ totalScore: "desc" }, { createdAt: "asc" }],
    });
    const candidate = chooseCandidate(candidates);
    assertStep(candidate, "Auto Draft 대상 후보 없음", candidates.slice(0, 5));

    log(`Auto Draft 실행: ${candidate.keyword}`);
    const draftResponse = await request("POST", `/api/topics/${topicId}/candidates/${candidate.id}/auto-draft`, {
      regenerate: false,
    });
    assertStep(draftResponse.ok, "Auto Draft API 실패", draftResponse);
    assertStep(draftResponse.payload.postId, "Auto Draft postId 없음", draftResponse.payload);
    assertStep(
      ["success", "partial"].includes(draftResponse.payload.status),
      "Auto Draft 상태가 success/partial이 아님",
      draftResponse.payload,
    );

    const completed = new Set(draftResponse.payload.completedSteps ?? []);
    for (const step of ["angle", "createPost", "outline", "draft", "review", "seo", "export"]) {
      assertStep(completed.has(step), `Auto Draft 단계 누락: ${step}`, draftResponse.payload);
    }

    const post = await prisma.post.findUnique({ where: { id: draftResponse.payload.postId } });
    assertStep(post, "Post 저장 실패", draftResponse.payload);
    assertStep(post.workflowStep === "review", "approved 전 자동 정지 실패", post);
    assertStep(!post.approvedAt, "approvedAt이 자동 설정됨", post);
    assertStep(Boolean(post.outline && post.draft && post.reviewReport && post.seoPackage), "Post 생성물 저장 누락", post);

    log("Tistory Export 확인");
    const exportResponse = await request("GET", `/api/posts/${post.id}/export?format=tistory`);
    assertStep(exportResponse.ok, "Tistory Export API 실패", exportResponse);
    const bodyHtml = exportResponse.payload.bodyHtml ?? "";
    assertStep(bodyHtml.length > 0, "Tistory bodyHtml 없음", exportResponse.payload);
    assertStep(!/메타 설명:|태그:|reviewReport|SEO title/i.test(bodyHtml), "bodyHtml에 meta/tags/reviewReport 혼입", bodyHtml.slice(0, 800));
    assertStep(!/&lt;p\s+data-ke-size/i.test(bodyHtml), "bodyHtml에 escaped p 태그 혼입", bodyHtml.slice(0, 800));

    log("추천 칼럼 생성 확인");
    const ideasResponse = await request("POST", "/api/topic-ideas", { focusKeyword: "Claude Code" });
    assertStep(ideasResponse.ok, "추천 칼럼 API 실패", ideasResponse);
    assertStep((ideasResponse.payload.ideas ?? []).length >= 5, "추천 칼럼 5개 미만", ideasResponse.payload);
    const firstIdea = ideasResponse.payload.ideas[0];
    assertStep(firstIdea.title && firstIdea.rawTopic && firstIdea.memo && firstIdea.optionalKeywords, "추천 칼럼 필수 필드 누락", firstIdea);
    assertStep(!/WriterService|GenerationLog|provider success E2E|API Route/i.test(firstIdea.title), "일반 추천 제목에 내부 구현명 혼입", firstIdea);

    const logs = await prisma.generationLog.findMany({
      where: { action: { in: ["autoScout", "autoDraft", "generateTopicIdeas"] } },
      orderBy: { createdAt: "desc" },
    });
    assertStep(logs.some((entry) => entry.action === "autoScout"), "autoScout GenerationLog 누락", logs);
    assertStep(logs.some((entry) => entry.action === "autoDraft"), "autoDraft GenerationLog 누락", logs);
    assertStep(logs.some((entry) => entry.action === "generateTopicIdeas"), "generateTopicIdeas GenerationLog 누락", logs);

    console.log(
      JSON.stringify(
        {
          topicId,
          candidate: {
            keyword: candidate.keyword,
            verdict: candidate.verdict,
            totalScore: candidate.totalScore,
          },
          postId: post.id,
          workflowStep: post.workflowStep,
          autoScoutStatus: topicResponse.payload.autoScout.status,
          autoDraftStatus: draftResponse.payload.status,
          ideaCount: ideasResponse.payload.ideas.length,
        },
        null,
        2,
      ),
    );
  } finally {
    await stopDevServer();
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  await stopDevServer();
  await prisma.$disconnect();
  console.error(sanitize(error.stack ?? error.message ?? String(error)));
  process.exit(1);
});
