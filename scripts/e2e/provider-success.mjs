import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const prisma = new PrismaClient();

const args = new Set(process.argv.slice(2));
const port = Number(process.env.E2E_PORT ?? 3030);
const appBaseUrl = `http://127.0.0.1:${port}`;
const providerMode = process.env.WRITER_PROVIDER === "api-key" ? "api-key" : "oauth-proxy";
const providerBaseUrl = process.env.OPENAI_BASE_URL ?? "http://127.0.0.1:10531/v1";
const cleanupDb = args.has("--cleanup-db") || process.env.E2E_CLEANUP_DB === "1";
const timeoutMs = Number(process.env.E2E_TIMEOUT_MS ?? 180_000);
const defaultModelPreference = [
  "gpt-5.4-mini",
  "gpt-5.3-codex-spark",
  "gpt-5.4",
  "gpt-5.3-codex",
  "gpt-5.2",
  "gpt-5.5",
];
const topicInput = {
  rawTopic: "AI",
  memo: "ChatGPT 구독과 API, Codex OAuth 프록시, 블로그 자동 작성기, AI 에이전트 자동화 중에서 지금 블로그에 쓸 만한 글감을 찾고 싶다.",
  optionalKeywords: "ChatGPT API, Codex OAuth, AI 에이전트, 블로그 자동화, 로컬 LLM",
  avoidTopics: "단순 뉴스 요약, 근거 없는 루머, 너무 일반적인 AI 소개글",
};
const dcinsideInfoFixture = `
  <table>
    <tr class="ub-content us-post notice" data-no="1">
      <td class="gall_tit ub-word"><a href="/notice">공지</a></td>
    </tr>
    <tr class="ub-content us-post" data-no="1100001">
      <td class="gall_num">1100001</td>
      <td class="gall_tit ub-word">
        <a href="/mgallery/board/view/?id=thesingularity&no=1100001&page=1">AI 에이전트 자동화 도구 비교 후기<span class="reply_num">[12]</span></a>
      </td>
      <td class="gall_writer ub-writer" data-nick="테스터"></td>
      <td class="gall_date" title="2026.04.28 09:30">04.28</td>
      <td class="gall_count">1,234</td>
      <td class="gall_recommend">21</td>
    </tr>
    <tr class="ub-content us-post" data-no="1100002">
      <td class="gall_num">1100002</td>
      <td class="gall_tit ub-word">
        <a href="/mgallery/board/view/?id=thesingularity&no=1100002&page=1">gpt 신모델 벤치 유출 떴다<span class="reply_num">[3]</span></a>
      </td>
      <td class="gall_writer ub-writer" data-nick="루머맨"></td>
      <td class="gall_date" title="2026.04.28 10:10">04.28</td>
      <td class="gall_count">300</td>
      <td class="gall_recommend">7</td>
    </tr>
    <tr class="ub-content us-post" data-no="1100003">
      <td class="gall_tit ub-word"></td>
    </tr>
  </table>
  <script>alert("xss")</script>
  <iframe src="https://example.com"></iframe>
`;
const dcinsideBestFixture = `
  <table>
    <tr class="ub-content us-post" data-no="1200001">
      <td class="gall_num">1200001</td>
      <td class="gall_tit ub-word">
        <a href="/mgallery/board/view/?id=thesingularity&no=1200001&page=1">로컬 LLM 코딩 자동화 운영 문제 정리<span class="reply_num">[18]</span></a>
      </td>
      <td class="gall_writer ub-writer" data-nick="운영자아님"></td>
      <td class="gall_date" title="2026.04.28 11:20">04.28</td>
      <td class="gall_count">2,001</td>
      <td class="gall_recommend">45</td>
    </tr>
  </table>
`;

let devServer = null;
let stoppingDevServer = false;

function logStep(message) {
  console.log(`[e2e] ${message}`);
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
    .replace(/refresh_token["']?\s*[:=]\s*["']?[^"',\s}]+/gi, "refresh_token: [redacted]")
    .replace(/auth\.json/gi, "[redacted-auth-file]");
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

function assertNoDangerousMarkup(label, value) {
  assertStep(
    !/<\/?script\b|<\/?iframe\b|<\/?object\b|<\/?embed\b|\son[a-z]+\s*=|javascript\s*:/i.test(value),
    label,
    { preview: String(value).slice(0, 500) },
  );
}

async function runCommand(command, commandArgs, options = {}) {
  const output = [];

  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: projectRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
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

async function waitForApp(startedAt = Date.now()) {
  while (Date.now() - startedAt < timeoutMs) {
    if (devServer?.exitCode !== null) {
      throw new Error("Next dev server exited before E2E completed.");
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
  if (!rawPath) return null;

  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }

  return path.resolve(projectRoot, "prisma", rawPath);
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

async function configureProviderFromAvailableModels() {
  logStep("provider 인증과 모델 목록을 확인합니다.");
  const auth = await request("POST", "/api/provider-auth/check", {
    mode: providerMode,
    baseUrl: providerBaseUrl,
  });
  assertStep(auth.ok && auth.payload.ok, "provider auth check failed", auth);

  const models = Array.isArray(auth.payload.models) ? auth.payload.models : [];
  assertStep(models.length > 0, "provider returned no models", auth.payload);

  const requestedModel = process.env.WRITER_MODEL;
  const preferredModel = defaultModelPreference.find((model) => models.includes(model));
  const selectedModel = requestedModel && models.includes(requestedModel) ? requestedModel : preferredModel ?? models[0];

  const config = await request("PATCH", "/api/provider-config", {
    mode: providerMode,
    baseUrl: providerBaseUrl,
    model: selectedModel,
  });
  assertStep(config.ok, "provider config update failed", config);

  return { status: auth.payload.status, models, selectedModel };
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

  if (cleanupDb) {
    logStep("이전 E2E SQLite DB를 정리합니다.");
    await cleanupSqliteDb();
  }

  logStep("Prisma migration을 적용합니다.");
  await runCommand("npx", ["prisma", "migrate", "deploy"]);
  logStep(`Next dev server를 ${appBaseUrl} 에서 시작합니다.`);
  startDevServer();
  await waitForApp();

  const provider = await configureProviderFromAvailableModels();
  logStep(`provider 연결 성공, model=${provider.selectedModel}`);

  logStep("Topic을 생성합니다.");
  const topic = await request("POST", "/api/topics", topicInput);
  assertStep(topic.ok, "topic create failed", topic);
  const topicId = topic.payload.topic.id;

  logStep("TrendCandidate를 생성합니다.");
  const generated = await request("POST", `/api/topics/${topicId}/generate-candidates`);
  assertStep(
    generated.ok && generated.payload.generationStatus === "success",
    "candidate generation failed",
    generated,
  );

  logStep("TrendCandidate 점수를 계산합니다.");
  const scored = await request("POST", `/api/topics/${topicId}/score-candidates`);
  assertStep(
    scored.ok && scored.payload.generationStatus === "success",
    "candidate scoring failed",
    scored,
  );

  const candidates = scored.payload.candidates;
  assertStep(Array.isArray(candidates) && candidates.length >= 10, "candidate count failed", {
    count: candidates?.length,
  });
  assertStep(
    candidates.some((candidate) => candidate.verdict === "review_first"),
    "no review_first candidate",
    candidates.slice(0, 5).map((candidate) => ({
      keyword: candidate.keyword,
      totalScore: candidate.totalScore,
      verdict: candidate.verdict,
    })),
  );
  assertStep(
    candidates.every((candidate) => candidate.verdict !== "write_now"),
    "estimated candidates should not be write_now",
    candidates.map((candidate) => ({
      keyword: candidate.keyword,
      totalScore: candidate.totalScore,
      verdict: candidate.verdict,
      scoringBasis: candidate.scoringBasis,
    })),
  );

  const reviewFirstCandidates = candidates
    .filter((candidate) => candidate.verdict === "review_first")
    .sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1));
  const selected = reviewFirstCandidates[0];

  assertStep(Boolean(selected), "no review_first candidate", {
    topCandidates: candidates.slice(0, 5).map((candidate) => ({
      keyword: candidate.keyword,
      totalScore: candidate.totalScore,
      verdict: candidate.verdict,
    })),
  });

  logStep("DCInside Manual HTML Import를 검증합니다.");
  const oversizedImport = await request("POST", `/api/topics/${topicId}/community/import-html`, {
    sourceTab: "info",
    html: "x".repeat(500_001),
  });
  assertStep(!oversizedImport.ok && oversizedImport.status === 413, "oversized DCInside HTML should be rejected", {
    status: oversizedImport.status,
    payload: oversizedImport.payload,
  });

  const infoPreview = await request("POST", `/api/topics/${topicId}/community/import-html`, {
    mode: "preview",
    sourceTab: "info",
    pageUrl: "https://gall.dcinside.com/mgallery/board/lists/?id=thesingularity",
    html: dcinsideInfoFixture,
  });
  assertStep(
    infoPreview.ok &&
      infoPreview.payload.importedCount === 0 &&
      infoPreview.payload.signals?.length === 2 &&
      typeof infoPreview.payload.parserVersion === "string" &&
      infoPreview.payload.skipReasonSummary?.notice_or_ad >= 1 &&
      infoPreview.payload.skipReasonSummary?.empty_row >= 1 &&
      infoPreview.payload.signals.some(
        (signal) =>
          signal.externalId === "1100001" &&
          signal.viewCount === 1234 &&
          signal.commentCount === 12 &&
          signal.recommendCount === 21,
      ) &&
      infoPreview.payload.signals.some((signal) => signal.riskLevel === "high" && signal.signalType === "rumor"),
    "DCInside info preview failed",
    infoPreview,
  );
  assertStep(
    !/<tr|<script|<iframe|onerror/i.test(JSON.stringify(infoPreview.payload)),
    "DCInside preview payload should not contain raw HTML",
    infoPreview,
  );

  const infoSave = await request("POST", `/api/topics/${topicId}/community/import-html`, {
    mode: "save",
    sourceTab: "info",
    pageUrl: "https://gall.dcinside.com/mgallery/board/lists/?id=thesingularity",
    html: dcinsideInfoFixture,
  });
  assertStep(
    infoSave.ok && infoSave.payload.importedCount === 2 && infoSave.payload.skippedCount >= 2,
    "DCInside info save failed",
    infoSave,
  );

  const duplicateInfoSave = await request("POST", `/api/topics/${topicId}/community/import-html`, {
    mode: "save",
    sourceTab: "info",
    pageUrl: "https://gall.dcinside.com/mgallery/board/lists/?id=thesingularity",
    html: dcinsideInfoFixture,
  });
  assertStep(
    duplicateInfoSave.ok && duplicateInfoSave.payload.importedCount === 0,
    "DCInside duplicate dedupe failed",
    duplicateInfoSave,
  );

  const normalSignal = infoSave.payload.signals.find((signal) => signal.riskLevel !== "high");
  assertStep(Boolean(normalSignal?.id), "normal DCInside signal missing", infoSave);
  const candidateFromSignal = await request(
    "POST",
    `/api/topics/${topicId}/community/signals/${normalSignal.id}/create-candidate`,
  );
  assertStep(
    candidateFromSignal.ok &&
      candidateFromSignal.payload.candidate?.verdict !== "write_now" &&
      candidateFromSignal.payload.candidate?.scoringBasis === "community_unverified",
    "community signal candidate creation failed",
    candidateFromSignal,
  );
  const sourceMeta = JSON.parse(candidateFromSignal.payload.candidate.sourceMetaJson ?? "{}");
  assertStep(
    sourceMeta.sourceType === normalSignal.sourceType &&
      sourceMeta.sourceName === normalSignal.sourceName &&
      sourceMeta.signalTitle === normalSignal.title &&
      sourceMeta.signalUrl === normalSignal.url &&
      sourceMeta.signalType === normalSignal.signalType &&
      sourceMeta.riskLevel === normalSignal.riskLevel &&
      sourceMeta.verificationStatus === normalSignal.verificationStatus &&
      sourceMeta.sourceTab === normalSignal.sourceTab &&
      !/rawHtml|originalHtml|<tr|<script|<iframe|onerror/i.test(JSON.stringify(sourceMeta)),
    "community signal sourceMetaJson failed",
    { sourceMeta, normalSignal },
  );
  const trendsPageAfterSignalCandidate = await requestText(`/topics/${topicId}/trends`);
  const escapedSignalUrl = normalSignal.url.replaceAll("&", "&amp;");
  assertStep(
    trendsPageAfterSignalCandidate.ok &&
      trendsPageAfterSignalCandidate.text.includes("커뮤니티 조기 신호입니다. 공식 확인 전 사실로 단정하지 마세요.") &&
      trendsPageAfterSignalCandidate.text.includes(normalSignal.title) &&
      trendsPageAfterSignalCandidate.text.includes(escapedSignalUrl) &&
      trendsPageAfterSignalCandidate.text.includes(normalSignal.riskLevel) &&
      trendsPageAfterSignalCandidate.text.includes(normalSignal.verificationStatus),
    "community source metadata UI smoke failed",
    { preview: trendsPageAfterSignalCandidate.text.slice(0, 1800), sourceMeta },
  );

  const bestSave = await request("POST", `/api/topics/${topicId}/community/import-html`, {
    mode: "save",
    sourceTab: "best",
    pageUrl: "https://gall.dcinside.com/mgallery/board/lists/?id=thesingularity&sort_type=N&exception_mode=recommend",
    html: dcinsideBestFixture,
  });
  assertStep(bestSave.ok && bestSave.payload.importedCount === 1, "DCInside best save failed", bestSave);
  const bestSignal = bestSave.payload.signals[0];
  const connectSignal = await request("PATCH", `/api/topics/${topicId}/community/signals/${bestSignal.id}`, {
    candidateId: selected.id,
  });
  assertStep(connectSignal.ok && connectSignal.payload.signal?.candidateId === selected.id, "community signal connect failed", connectSignal);

  const savedSignals = await prisma.communitySignal.findMany({ where: { topicId } });
  assertStep(
    savedSignals.length >= 3 &&
      savedSignals.every((signal) => signal.title && signal.url && signal.rawMetaJson && !/<tr|<script|<iframe|onerror/i.test(signal.rawMetaJson)) &&
      savedSignals.some((signal) => signal.candidateId === null) &&
      savedSignals.every((signal) => signal.verificationStatus !== "official_confirmed"),
    "saved CommunitySignal metadata failed",
    savedSignals.map((signal) => ({
      title: signal.title,
      candidateId: signal.candidateId,
      rawMetaJson: signal.rawMetaJson,
      verificationStatus: signal.verificationStatus,
    })),
  );

  const communityPage = await requestText(`/topics/${topicId}/community`);
  assertStep(
    communityPage.ok &&
      communityPage.text.includes("DCInside Manual HTML Import") &&
      communityPage.text.includes("공식 확인 전 write_now는 허용하지 않습니다.") &&
      communityPage.text.includes("미리보기 JSON 복사") &&
      communityPage.text.includes("미리보기 JSON 다운로드") &&
      communityPage.text.includes("이 신호로 글감 후보 만들기") &&
      communityPage.text.includes("후보 미연결"),
    "Community Radar UI smoke failed",
    { preview: communityPage.text.slice(0, 1500) },
  );
  const dcinsideImportFormSource = readFileSync(path.join(projectRoot, "components/dcinside-html-import-form.tsx"), "utf8");
  assertStep(
    dcinsideImportFormSource.includes("미리보기 결과가 없습니다. 먼저 파싱 미리보기를 실행하세요.") &&
      dcinsideImportFormSource.includes("미리보기 JSON을 복사했습니다.") &&
      dcinsideImportFormSource.includes("dcinside-${previewResult.sourceTab || \"unknown\"}-preview.json") &&
      dcinsideImportFormSource.includes("title/url 누락 row") &&
      dcinsideImportFormSource.includes("hasImage true") &&
      dcinsideImportFormSource.includes("skipReasonSummary") &&
      !dcinsideImportFormSource.includes("html: previewResult"),
    "DCInside preview copy/download source smoke failed",
    {},
  );

  logStep("선택 후보로 Post를 생성합니다.");
  const post = await request("POST", "/api/posts/from-candidate", { candidateId: selected.id });
  assertStep(post.ok && post.payload.generationStatus === "success", "post create failed", post);
  const postId = post.payload.post.id;

  logStep("review 전 승인 차단을 확인합니다.");
  const earlyApprove = await request("PATCH", `/api/posts/${postId}`, { workflowStep: "approved" });
  assertStep(
    !earlyApprove.ok && earlyApprove.status === 400,
    "approval before review should be blocked",
    earlyApprove,
  );

  logStep("outline을 생성합니다.");
  const outline = await request("POST", `/api/posts/${postId}/generate-outline`);
  assertStep(outline.ok && outline.payload.generationStatus === "success", "outline failed", outline);

  logStep("draft를 생성합니다.");
  const draft = await request("POST", `/api/posts/${postId}/generate-draft`);
  assertStep(draft.ok && draft.payload.generationStatus === "success", "draft failed", draft);

  logStep("reviewReport 전 승인 차단을 확인합니다.");
  const preReviewApprove = await request("PATCH", `/api/posts/${postId}`, {
    workflowStep: "approved",
  });
  assertStep(
    !preReviewApprove.ok && preReviewApprove.status === 400,
    "approval before review report should be blocked",
    preReviewApprove,
  );

  logStep("검수 전 Export warning을 확인합니다.");
  const preReviewWorkflowPage = await requestText(`/posts/${postId}/workflow`);
  assertStep(preReviewWorkflowPage.ok, "pre-review workflow page failed", {
    status: preReviewWorkflowPage.status,
    preview: preReviewWorkflowPage.text.slice(0, 500),
  });
  assertStep(
    preReviewWorkflowPage.text.includes("검수 전 내보내기입니다.") &&
      preReviewWorkflowPage.text.includes("SEO 패키지가 아직 없습니다. 먼저 검수 실행을 눌러주세요."),
    "pre-review export warnings missing",
    { preview: preReviewWorkflowPage.text.slice(0, 1200) },
  );

  logStep("reviewReport를 생성합니다.");
  const review = await request("POST", `/api/posts/${postId}/review`);
  assertStep(review.ok && review.payload.generationStatus === "success", "review failed", review);

  logStep("export 생성과 HTML sanitize를 확인합니다.");
  const unsafeDraft = [
    review.payload.post.draft,
    "",
    "## 티스토리 테스트 섹션",
    "일반 문단과 <span data-ui=\"term\" data-note=\"간단한 설명\">용어</span> 확인",
    "",
    "> 핵심 포인트: 운영 블로그 인용 박스 확인",
    "> 두 번째 줄",
    "",
    "| 구분 | 내용 |",
    "| --- | --- |",
    "| A | 표 스타일 확인 |",
    "",
    "---",
    "",
    "```ts",
    "const x = 1;",
    "console.log(x);",
    "```",
    "",
    "<script>alert('xss')</script>",
    "<iframe src=\"https://example.com\"></iframe>",
    "<img src=\"x\" onerror=\"alert('xss')\">",
    "[위험 링크](javascript:alert('xss'))",
  ].join("\n");
  const unsafePatch = await request("PATCH", `/api/posts/${postId}`, { draft: unsafeDraft });
  assertStep(unsafePatch.ok, "unsafe draft patch failed", unsafePatch);

  const markdownExport = await request("GET", `/api/posts/${postId}/export?format=markdown`);
  const htmlExport = await request("GET", `/api/posts/${postId}/export?format=html`);
  const tistoryExport = await request("GET", `/api/posts/${postId}/export?format=tistory`);
  const packageExport = await request("GET", `/api/posts/${postId}/export?format=package`);

  assertStep(markdownExport.ok, "markdown export failed", markdownExport);
  assertStep(htmlExport.ok, "html export failed", htmlExport);
  assertStep(tistoryExport.ok, "tistory export failed", tistoryExport);
  assertStep(packageExport.ok, "package export failed", packageExport);
  assertStep(markdownExport.payload.content.includes("SEO title:"), "markdown export metadata missing", markdownExport);
  assertStep(htmlExport.payload.content.includes("<article>"), "html export article missing", htmlExport);
  assertStep(
    htmlExport.payload.content.includes('<pre><code class="language-ts">') &&
      htmlExport.payload.content.includes("const x = 1;"),
    "html export code fence missing",
    htmlExport,
  );
  assertStep(
    typeof tistoryExport.payload.bodyHtml === "string" &&
      typeof tistoryExport.payload.title === "string" &&
      typeof tistoryExport.payload.seoTitle === "string" &&
      typeof tistoryExport.payload.tagsText === "string" &&
      typeof tistoryExport.payload.reviewReportText === "string",
    "tistory export shape failed",
    tistoryExport,
  );
  assertStep(
    tistoryExport.payload.bodyHtml.includes("<pre") &&
      tistoryExport.payload.bodyHtml.includes("<code>") &&
      tistoryExport.payload.bodyHtml.includes("const x = 1;"),
    "tistory export code fence missing",
    tistoryExport,
  );
  assertStep(
    !tistoryExport.payload.bodyHtml.includes("<article>") &&
      !tistoryExport.payload.bodyHtml.includes("SEO title:") &&
      !tistoryExport.payload.bodyHtml.includes("Meta description:") &&
      !tistoryExport.payload.bodyHtml.includes("Tags:") &&
      !tistoryExport.payload.bodyHtml.includes(tistoryExport.payload.reviewReportText.slice(0, 40)),
    "tistory bodyHtml contains metadata fields",
    tistoryExport,
  );
  assertStep(
    tistoryExport.payload.bodyHtml.includes('<p data-ke-size="size16">') &&
      tistoryExport.payload.bodyHtml.includes('<h2 data-ke-size="size26">티스토리 테스트 섹션</h2>') &&
      tistoryExport.payload.bodyHtml.includes('data-ke-style="style1"') &&
      tistoryExport.payload.bodyHtml.includes('<table style="width: 100%; border-collapse: collapse; border: 2px solid #8d8d8d; margin: 18px 0" data-ke-align="alignLeft">') &&
      tistoryExport.payload.bodyHtml.includes('<pre class="ts" style="padding: 12px; background: #f8f8f8; border: 1px solid #dddddd; overflow: auto"><code>') &&
      tistoryExport.payload.bodyHtml.includes('<span data-ui="term" data-note="간단한 설명">용어</span>'),
    "tistory operation html format missing",
    tistoryExport,
  );
  assertStep(
    packageExport.payload.package?.exportHtml && packageExport.payload.package?.exportMarkdown,
    "package export shape failed",
    packageExport,
  );
  assertNoDangerousMarkup("markdown export contains dangerous markup", markdownExport.payload.content);
  assertNoDangerousMarkup("html export contains dangerous markup", htmlExport.payload.content);
  assertNoDangerousMarkup("tistory export contains dangerous markup", tistoryExport.payload.bodyHtml);
  assertNoDangerousMarkup("package html export contains dangerous markup", packageExport.payload.package.exportHtml);

  logStep("Export 패널의 티스토리 복사 UX 문구를 확인합니다.");
  const workflowPage = await requestText(`/posts/${postId}/workflow`);
  assertStep(workflowPage.ok, "workflow page failed", {
    status: workflowPage.status,
    preview: workflowPage.text.slice(0, 500),
  });
  assertStep(
    workflowPage.text.includes("티스토리 HTML 모드용 복사") &&
      workflowPage.text.includes("티스토리 기본모드용 복사") &&
      workflowPage.text.includes("티스토리 붙여넣기 도움말") &&
      workflowPage.text.includes("HTML 태그가 글자로 보이면 티스토리 편집기를 HTML 모드로 전환한 뒤 붙여넣으세요.") &&
      workflowPage.text.includes("티스토리 HTML 모드용 복사는 기본 편집 모드가 아니라 HTML 편집 모드에 붙여넣어야 합니다."),
    "tistory copy UX labels missing",
    { preview: workflowPage.text.slice(0, 1200) },
  );
  const exportPanelSource = readFileSync(path.join(projectRoot, "components/post-export-panel.tsx"), "utf8");
  assertStep(
    exportPanelSource.includes("ClipboardItem") &&
      exportPanelSource.includes('"text/html"') &&
      exportPanelSource.includes('"text/plain"') &&
      exportPanelSource.includes("브라우저가 HTML 클립보드를 지원하지 않아 HTML 문자열로 복사했습니다.") &&
      exportPanelSource.includes("EmptyCopyError") &&
      exportPanelSource.includes("HTML 태그가 escaped 문자열로 보입니다.") &&
      exportPanelSource.includes("검수 리포트가 아직 없습니다. 먼저 검수 실행을 눌러주세요.") &&
      exportPanelSource.includes("SEO 패키지가 아직 없습니다. 먼저 검수 실행을 눌러주세요.") &&
      exportPanelSource.includes("티스토리 HTML 본문이 아직 없습니다. 초안을 먼저 생성하세요."),
    "clipboard source smoke check failed",
    {},
  );

  logStep("review 후 승인을 확인합니다.");
  const approve = await request("PATCH", `/api/posts/${postId}`, { workflowStep: "approved" });
  assertStep(
    approve.ok && approve.payload.post.workflowStep === "approved",
    "approval after review failed",
    approve,
  );

  logStep("DB 저장 상태와 GenerationLog를 확인합니다.");
  const saved = await prisma.post.findUnique({ where: { id: postId } });
  assertStep(
    saved?.workflowStep === "approved" && saved.outline && saved.draft && saved.reviewReport,
    "post persistence failed",
    saved,
  );

  const actions = new Set([
    "generateKeywordCandidates",
    "scoreTrendCandidates",
    "generateAngle",
    "generateOutline",
    "generateDraft",
    "reviewDraft",
    "generateSeoPackage",
  ]);
  const logs = await prisma.generationLog.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
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

  return {
    providerStatus: provider.status,
    model: provider.selectedModel,
    modelCount: provider.models.length,
    topicId,
    postId,
    selectedCandidate: {
      keyword: selected.keyword,
      totalScore: selected.totalScore,
      verdict: selected.verdict,
      scoringBasis: selected.scoringBasis,
      confidence: selected.confidence,
    },
    topCandidates: candidates.slice(0, 5).map((candidate) => ({
      keyword: candidate.keyword,
      totalScore: candidate.totalScore,
      verdict: candidate.verdict,
      scoringBasis: candidate.scoringBasis,
      confidence: candidate.confidence,
      scoringVersion: candidate.scoringVersion,
    })),
    generationStatuses: {
      generateCandidates: generated.payload.generationStatus,
      scoreCandidates: scored.payload.generationStatus,
      createPost: post.payload.generationStatus,
      outline: outline.payload.generationStatus,
      draft: draft.payload.generationStatus,
      review: review.payload.generationStatus,
    },
    exportChecks: {
      markdown: markdownExport.status,
      html: htmlExport.status,
      tistory: tistoryExport.status,
      package: packageExport.status,
      sanitized: true,
    },
    approvalChecks: {
      beforeOutlineReview: earlyApprove.status,
      beforeReviewReport: preReviewApprove.status,
      afterReview: approve.payload.post.workflowStep,
    },
  };
}

try {
  const result = await runE2E();
  await stopDevServer();
  await prisma.$disconnect();
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
  await prisma.$disconnect();
  console.error(sanitize(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
