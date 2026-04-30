import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const port = Number(process.env.E2E_AUTO_WORKFLOW_PROGRESS_PORT ?? 3040);
const appBaseUrl = `http://127.0.0.1:${port}`;
const timeoutMs = Number(process.env.E2E_TIMEOUT_MS ?? 300_000);

process.env.DATABASE_URL ??= "file:./auto-workflow-progress-e2e.db";
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
  console.log(`[auto-workflow-progress] ${message}`);
}

function appendRing(buffer, chunk, maxLines = 80) {
  const lines = sanitize(chunk.toString()).split(/\r?\n/).filter(Boolean);
  buffer.push(...lines);
  if (buffer.length > maxLines) buffer.splice(0, buffer.length - maxLines);
}

function assertStep(condition, label, detail) {
  if (!condition) throw new Error(`${label}: ${sanitize(JSON.stringify(detail)).slice(0, 1600)}`);
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
    if (devServer?.exitCode !== null) throw new Error("Next dev server exited before Auto Workflow Progress E2E completed.");
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
      defaultTone: "명확하고 현실적인 존댓말",
      preferredStructure: "답부터 시작하고 확인 기준과 개인 판단으로 마무리한다.",
      forbiddenPhrases: "무조건, 완벽, if then, WriterService, GenerationLog",
      seoRules: "검색자가 실제로 입력할 표현을 우선한다.",
      htmlRules: "본문 HTML에는 제목, 메타 설명, 태그, 검수 리포트를 섞지 않는다.",
      tooltipRules: "낯선 용어는 짧게 설명한다.",
      imagePromptRules: "실제 작업 맥락의 이미지",
    },
  });
}

async function getRun(runId) {
  const response = await request("GET", `/api/workflow-runs/${runId}`);
  assertStep(response.ok, "WorkflowRun 조회 실패", response);
  return response.payload;
}

async function pollRunUntilFinished(runId, inFlightPromise) {
  const observed = [];
  const startedAt = Date.now();
  inFlightPromise.catch(() => undefined);

  while (Date.now() - startedAt < timeoutMs) {
    const run = await getRun(runId);
    observed.push({
      status: run.status,
      progressPercent: run.progressPercent,
      currentStep: run.currentStep,
      runningSteps: run.steps.filter((step) => step.status === "running").map((step) => step.stepKey),
    });
    if (!["queued", "running"].includes(run.status)) return { run, observed };
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  throw new Error(`WorkflowRun polling timeout: ${runId}`);
}

function assertProgressRun(label, run, observed) {
  assertStep(run.progressPercent === 100, `${label} progressPercent 100 아님`, run);
  assertStep(["success", "partial"].includes(run.status), `${label} status가 success/partial이 아님`, run);
  assertStep(observed.some((item) => item.progressPercent > 0 && item.progressPercent < 100), `${label} 중간 진행률 관측 실패`, observed);
  assertStep(run.steps.every((step) => step.status !== "pending" && step.status !== "running"), `${label} 미완료 step 존재`, run.steps);
  assertStep(run.steps.some((step) => step.status === "success" || step.status === "skipped"), `${label} 성공/skip step 없음`, run.steps);
  assertStep(run.warnings.length === 0 || run.status !== "failed", `${label} warning이 failed로 처리됨`, run);
}

function assertTracedSteps(label, run, stepKeys) {
  for (const stepKey of stepKeys) {
    const step = run.steps.find((item) => item.stepKey === stepKey);
    assertStep(step, `${label} 추적 대상 step 없음: ${stepKey}`, run.steps);
    assertStep(step.generationLogId, `${label} generationLogId 누락: ${stepKey}`, step);
  }
}

function assertCompletedStepCount(label, run, minCount) {
  const completedCount = run.steps.filter((step) => step.status === "success" || step.status === "skipped").length;
  assertStep(completedCount >= minCount, `${label} 완료 step 개수 부족`, { completedCount, minCount, steps: run.steps });
}

async function main() {
  try {
    if (process.env.E2E_CLEANUP_DB === "1") await cleanupSqliteDb();
    log("prisma migrate deploy");
    await runCommand("npx", ["prisma", "migrate", "deploy"]);
    await seedBlogProfile();

    log("start dev server");
    startDevServer();
    await waitForApp();

    log("Topic 생성");
    const topicResponse = await request("POST", "/api/topics", {
      rawTopic: "AI",
      memo: "Claude Code, Codex, 블로그 자동화 중 오늘 쓸 만한 글감을 찾는다.",
      optionalKeywords: "Claude Code, Codex, 블로그 자동화, AI 코딩 도구",
      avoidTopics: "근거 없는 루머, 너무 일반적인 AI 소개글",
      autoScout: false,
    });
    assertStep(topicResponse.ok, "Topic 생성 실패", topicResponse);
    const topicId = topicResponse.payload.topic.id;

    log("Auto Scout WorkflowRun 생성");
    const scoutRunResponse = await request("POST", "/api/workflow-runs", { runType: "auto_scout", topicId });
    assertStep(scoutRunResponse.ok, "Auto Scout run 생성 실패", scoutRunResponse);
    assertStep(scoutRunResponse.payload.progressPercent === 0, "Auto Scout 초기 진행률이 0이 아님", scoutRunResponse.payload);
    assertStep(scoutRunResponse.payload.steps.every((step) => step.status === "pending"), "Auto Scout 초기 step 상태가 pending이 아님", scoutRunResponse.payload.steps);

    const scoutPromise = request("POST", `/api/topics/${topicId}/auto-scout`, { runId: scoutRunResponse.payload.id });
    const scoutProgress = await pollRunUntilFinished(scoutRunResponse.payload.id, scoutPromise);
    const scoutResponse = await scoutPromise.catch((error) => ({ ok: false, error: sanitize(error.message ?? String(error)) }));
    assertStep(scoutResponse.ok || ["success", "partial"].includes(scoutProgress.run.status), "Auto Scout API 실패", scoutResponse);
    assertProgressRun("Auto Scout", scoutProgress.run, scoutProgress.observed);
    assertCompletedStepCount("Auto Scout", scoutProgress.run, 6);
    assertTracedSteps("Auto Scout", scoutProgress.run, [
      "generate_candidates",
      "score_candidates",
      "collect_trend_signals",
      "collect_community_signals",
    ]);

    const candidates = await prisma.trendCandidate.findMany({
      where: { topicId },
      orderBy: [{ totalScore: "desc" }, { createdAt: "asc" }],
    });
    const candidate = candidates.find((item) => item.verdict === "review_first") ?? candidates[0];
    assertStep(candidate, "Auto Draft 후보 없음", candidates.slice(0, 5));

    log("Auto Draft WorkflowRun 생성");
    const draftRunResponse = await request("POST", "/api/workflow-runs", {
      runType: "auto_draft",
      topicId,
      candidateId: candidate.id,
    });
    assertStep(draftRunResponse.ok, "Auto Draft run 생성 실패", draftRunResponse);

    const draftPromise = request("POST", `/api/topics/${topicId}/candidates/${candidate.id}/auto-draft`, {
      runId: draftRunResponse.payload.id,
    });
    const draftProgress = await pollRunUntilFinished(draftRunResponse.payload.id, draftPromise);
    const draftResponse = await draftPromise.catch((error) => ({ ok: false, error: sanitize(error.message ?? String(error)) }));
    assertStep(draftResponse.ok || ["success", "partial"].includes(draftProgress.run.status), "Auto Draft API 실패", draftResponse);
    assertProgressRun("Auto Draft", draftProgress.run, draftProgress.observed);
    assertCompletedStepCount("Auto Draft", draftProgress.run, 8);
    assertTracedSteps("Auto Draft", draftProgress.run, [
      "generate_angle",
      "generate_outline",
      "generate_draft",
      "writer_editorial_pass",
      "generate_review",
      "generate_seo",
    ]);

    const draftResult = draftProgress.run.result && typeof draftProgress.run.result === "object" ? draftProgress.run.result : {};
    const postId = draftResponse.ok ? draftResponse.payload.postId : draftResult.postId;
    const post = await prisma.post.findUnique({ where: { id: postId } });
    assertStep(post, "Post 저장 실패", draftResponse.payload);
    assertStep(post.workflowStep === "review", "Auto Draft가 review 단계에서 멈추지 않음", post);
    assertStep(!post.approvedAt, "approved가 자동 처리됨", post);
    assertStep(Boolean(post.reviewReport), "reviewReport 저장 실패", post);

    log("Column Ideas WorkflowRun 확인");
    const ideasRunResponse = await request("POST", "/api/workflow-runs", { runType: "column_ideas" });
    assertStep(ideasRunResponse.ok, "Column Ideas run 생성 실패", ideasRunResponse);
    const ideasPromise = request("POST", "/api/topic-ideas", { focusKeyword: "Claude Code", runId: ideasRunResponse.payload.id });
    const ideasProgress = await pollRunUntilFinished(ideasRunResponse.payload.id, ideasPromise);
    const ideasResponse = await ideasPromise;
    assertStep(ideasResponse.ok, "Column Ideas API 실패", ideasResponse);
    assertProgressRun("Column Ideas", ideasProgress.run, ideasProgress.observed);
    assertStep((ideasResponse.payload.ideas ?? []).length >= 5, "추천 칼럼 5개 미만", ideasResponse.payload);

    const refetched = await getRun(draftRunResponse.payload.id);
    assertStep(refetched.id === draftRunResponse.payload.id && refetched.progressPercent === 100, "runId 재조회 복구 실패", refetched);

    console.log(JSON.stringify({
      ok: true,
      topicId,
      scoutRun: {
        id: scoutProgress.run.id,
        status: scoutProgress.run.status,
        progressPercent: scoutProgress.run.progressPercent,
        warningCount: scoutProgress.run.warnings.length,
      },
      draftRun: {
        id: draftProgress.run.id,
        status: draftProgress.run.status,
        progressPercent: draftProgress.run.progressPercent,
        postId: post.id,
        workflowStep: post.workflowStep,
        approved: Boolean(post.approvedAt),
      },
      columnIdeasRun: {
        id: ideasProgress.run.id,
        status: ideasProgress.run.status,
        progressPercent: ideasProgress.run.progressPercent,
        ideaCount: ideasResponse.payload.ideas.length,
      },
    }, null, 2));
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
