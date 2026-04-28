import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const port = Number(process.env.E2E_COMMUNITY_PORT ?? 3032);
const appBaseUrl = `http://127.0.0.1:${port}`;
process.env.DATABASE_URL ||= "file:./community-e2e.db";
process.env.COMMUNITY_COLLECTOR_MODE = "mock";
process.env.GITHUB_ISSUES_COLLECTOR_MODE = "mock";
process.env.GITHUB_TOKEN = "";
const previewFixturePaths = [
  path.join(projectRoot, "manual-fixtures/dcinside-info-preview-latest.json"),
  path.join(projectRoot, "manual-fixtures/dcinside-best-preview-latest.json"),
];
const previewFixtureBackups = previewFixturePaths.map((target) => ({
  target,
  existed: existsSync(target),
  content: existsSync(target) ? readFileSync(target, "utf8") : null,
}));

const dcinsidePreviewFixture = `
  <table>
    <tr class="ub-content us-post notice" data-no="1">
      <td class="gall_tit ub-word"><a href="/notice">공지</a></td>
    </tr>
    <tr class="ub-content us-post" data-no="330001">
      <td class="gall_num">330001</td>
      <td class="gall_tit ub-word">
        <a href="/mgallery/board/view/?id=thesingularity&no=330001&page=1">AI 자동화 도구 운영 이슈 정리<span class="reply_num">[8]</span></a>
      </td>
      <td class="gall_writer ub-writer" data-nick="테스터"></td>
      <td class="gall_date" title="2026.04.28 11:20">04.28</td>
      <td class="gall_count">1,111</td>
      <td class="gall_recommend">15</td>
    </tr>
    <tr class="ub-content us-post" data-no="330002">
      <td class="gall_tit ub-word"></td>
    </tr>
  </table>
  <script>alert("raw-html-should-not-return")</script>
`;
const dcinsideRealQaFixture = `
  <table>
    <tr class="ub-content us-post" data-no="440001">
      <td class="gall_num">440001</td>
      <td class="gall_tit ub-word">
        <img src="/img/user-icon.png" alt="프로필" />
        <span class="gall_head">업데이트</span>
        <a href="/mgallery/board/view/?id=thesingularity&no=440001&search_head=110&page=1">오피셜 공개 출시 모델 업데이트<span class="reply_num">[2]</span></a>
      </td>
      <td class="gall_writer ub-writer" data-nick="공식봄"></td>
      <td class="gall_date">11:20</td>
      <td class="gall_count">123</td>
      <td class="gall_recommend">5</td>
    </tr>
    <tr class="ub-content us-post" data-no="440002">
      <td class="gall_num">440002</td>
      <td class="gall_tit ub-word">
        <a href="/mgallery/board/view/?id=thesingularity&no=440002&search_head=110&page=1">트윗에서 나온 새 모델 얘기<span class="reply_num">[4]</span></a>
      </td>
      <td class="gall_writer ub-writer" data-nick="트윗봄"></td>
      <td class="gall_date">04.28</td>
      <td class="gall_count">456</td>
      <td class="gall_recommend">7</td>
    </tr>
    <tr class="ub-content us-post" data-no="440003">
      <td class="gall_num">440003</td>
      <td class="gall_tit ub-word">
        <a href="/mgallery/board/view/?id=thesingularity&no=440003&search_head=110&page=1">유출 찌라시 카더라 미확인 50% 하락<span class="reply_num">[9]</span></a>
      </td>
      <td class="gall_writer ub-writer" data-nick="위험봄"></td>
      <td class="gall_date">26.04.28</td>
      <td class="gall_count">789</td>
      <td class="gall_recommend">12</td>
    </tr>
    <tr class="ub-content us-post" data-no="440004">
      <td class="gall_num">440004</td>
      <td class="gall_tit ub-word">
        <a href="/mgallery/board/view/?id=thesingularity&no=440004&search_head=110&page=1">코파일럿 정액제-&gt;종량제 바뀌나<span class="reply_num">[1]</span></a>
      </td>
      <td class="gall_writer ub-writer" data-nick="가격봄"></td>
      <td class="gall_date" title="2026.04.28 12:30">04.28</td>
      <td class="gall_count">321</td>
      <td class="gall_recommend">3</td>
    </tr>
    <tr class="ub-content us-post" data-no="440005">
      <td class="gall_num">440005</td>
      <td class="gall_tit ub-word">
        <a href="/mgallery/board/view/?id=thesingularity&no=440005&search_head=110&page=1">클로드 프로, 클코에 오푸스 제공 중단 예정<span class="reply_num">[6]</span></a>
      </td>
      <td class="gall_writer ub-writer" data-nick="섭종봄"></td>
      <td class="gall_date">11:45</td>
      <td class="gall_count">654</td>
      <td class="gall_recommend">10</td>
    </tr>
    <tr class="ub-content us-post" data-no="440007">
      <td class="gall_num">440007</td>
      <td class="gall_tit ub-word">
        <a href="/mgallery/board/view/?id=thesingularity&no=440007&search_head=110&page=1">코덱스 1M컨텍 곧 지원할것<span class="reply_num">[5]</span></a>
      </td>
      <td class="gall_writer ub-writer" data-nick="지원봄"></td>
      <td class="gall_date">11:50</td>
      <td class="gall_count">777</td>
      <td class="gall_recommend">11</td>
    </tr>
    <tr class="ub-content us-post" data-no="440006">
      <td class="gall_num">440006</td>
      <td class="gall_tit ub-word">
        <span>버그 바운티 공개</span>
        <a href="/mgallery/board/view/?id=thesingularity&no=440006&search_head=110&page=1">버그 바운티 공개<span class="reply_num">[0]</span></a>
      </td>
      <td class="gall_writer ub-writer" data-nick="보상봄"></td>
      <td class="gall_date">04.28</td>
      <td class="gall_count">222</td>
      <td class="gall_recommend">2</td>
    </tr>
  </table>
`;

let devServer = null;
let stoppingDevServer = false;

function logStep(message) {
  console.log(`[community-smoke] ${message}`);
}

function sanitize(raw) {
  return String(raw)
    .replace(/authorization["']?\s*:\s*["']?bearer\s+[^"',\s}]+/gi, "authorization: [redacted]")
    .replace(/bearer\s+[a-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/REDDIT_BEARER_TOKEN=[^,\s]+/gi, "REDDIT_BEARER_TOKEN=[redacted]")
    .replace(/GITHUB_TOKEN=[^,\s]+/gi, "GITHUB_TOKEN=[redacted]");
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
      throw new Error("Next dev server exited before community smoke completed.");
    }

    try {
      const response = await fetch(appBaseUrl);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error("Next dev server did not become ready for community smoke.");
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

async function cleanupPreviewFixtures() {
  for (const backup of previewFixtureBackups) {
    if (backup.existed && backup.content !== null) {
      await mkdir(path.dirname(backup.target), { recursive: true });
      await writeFile(backup.target, backup.content, "utf8");
      continue;
    }

    if (existsSync(backup.target)) {
      await unlink(backup.target);
    }
  }
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
      memo: "커뮤니티 반응이 빠른 AI 개발 도구 글감을 확인한다.",
      optionalKeywords: "Codex OAuth, 블로그 자동화, 로컬 LLM",
      avoidTopics: "근거 없는 루머, 단순 뉴스 요약",
      blogProfileId: profile.id,
    },
  });
  const strong = await prisma.trendCandidate.create({
    data: {
      topicId: topic.id,
      keyword: "블로그 자동화용 기술 스택 선택",
      rationale: "실무 선택 기준과 실패 사례로 확장 가능한 후보",
      titleCandidates: JSON.stringify(["블로그 자동화용 기술 스택 선택 기준"]),
      scoringBasis: "estimated_without_external_data",
      searchGrowthScore: 24,
      newsVelocityScore: 15,
      communityHeatScore: 10,
      blogFitScore: 14,
      differentiationScore: 9,
      lifespanScore: 5,
      riskPenalty: 0,
      totalScore: 77,
      verdict: "review_first",
      confidence: "medium",
      scoringVersion: "v2",
    },
  });
  const rumor = await prisma.trendCandidate.create({
    data: {
      topicId: topic.id,
      keyword: "미확인 AI 도구 루머",
      rationale: "루머성 검증 대상",
      titleCandidates: JSON.stringify(["미확인 AI 도구 루머"]),
      scoringBasis: "estimated_without_external_data",
      searchGrowthScore: 18,
      newsVelocityScore: 12,
      communityHeatScore: 8,
      blogFitScore: 8,
      differentiationScore: 4,
      lifespanScore: 2,
      riskPenalty: -8,
      totalScore: 44,
      verdict: "hold",
      confidence: "low",
      scoringVersion: "v2",
    },
  });

  return { topic, strong, rumor };
}

try {
  assertStep(process.platform === "linux", "community smoke must run in WSL/Linux", { platform: process.platform });
  logStep("Prisma migration을 적용합니다.");
  await runCommand("npx", ["prisma", "migrate", "deploy"]);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const seeded = await seed(prisma);
  await prisma.$disconnect();

  logStep(`Next dev server를 ${appBaseUrl} 에서 시작합니다.`);
  startDevServer();
  await waitForApp();

  logStep("DCInside preview QA payload를 확인합니다.");
  const dcinsidePreview = await request("POST", `/api/topics/${seeded.topic.id}/community/import-html`, {
    mode: "preview",
    sourceTab: "info",
    pageUrl: "https://gall.dcinside.com/mgallery/board/lists/?id=thesingularity&sort_type=N&search_head=10&page=1",
    html: dcinsidePreviewFixture,
  });
  assertStep(
    dcinsidePreview.ok &&
      dcinsidePreview.payload.importedCount === 0 &&
      dcinsidePreview.payload.signals?.length === 1 &&
      dcinsidePreview.payload.skippedCount >= 2 &&
      dcinsidePreview.payload.skipReasonSummary?.notice_or_ad >= 1 &&
      dcinsidePreview.payload.skipReasonSummary?.empty_row >= 1 &&
      typeof dcinsidePreview.payload.parserVersion === "string",
    "DCInside preview response failed",
    dcinsidePreview,
  );
  assertStep(
    !/<tr|<script|raw-html-should-not-return/i.test(JSON.stringify(dcinsidePreview.payload)),
    "DCInside preview should not include raw HTML",
    dcinsidePreview,
  );
  const dcinsideRealQaPreview = await request("POST", `/api/topics/${seeded.topic.id}/community/import-html`, {
    mode: "preview",
    sourceTab: "info",
    pageUrl: "https://gall.dcinside.com/mgallery/board/lists/?id=thesingularity&sort_type=N&search_head=110&page=1",
    html: dcinsideRealQaFixture,
  });
  assertStep(
    dcinsideRealQaPreview.ok &&
      dcinsideRealQaPreview.payload.detectedSourceTab === "best" &&
      dcinsideRealQaPreview.payload.sourceTabMismatch === true &&
      dcinsideRealQaPreview.payload.warnings?.length > 0 &&
      dcinsideRealQaPreview.payload.signals?.length === 7,
    "DCInside sourceTab detection failed",
    dcinsideRealQaPreview,
  );
  const realQaSignals = Object.fromEntries(
    dcinsideRealQaPreview.payload.signals.map((signal) => {
      const meta = JSON.parse(signal.rawMetaJson ?? "{}");
      return [signal.externalId, { ...signal, meta }];
    }),
  );
  assertStep(
    realQaSignals["440001"].detectedSourceTab === "best" &&
      realQaSignals["440001"].sourceTab === "info" &&
      realQaSignals["440001"].sourceName.includes("정보탭"),
    "DCInside selected sourceTab priority failed",
    realQaSignals["440001"],
  );
  assertStep(
    realQaSignals["440001"].riskLevel === "low" &&
      realQaSignals["440001"].signalType === "product_update" &&
      realQaSignals["440001"].meta.hasImage === false &&
      realQaSignals["440001"].meta.category === "업데이트",
    "DCInside product update/risk/hasImage failed",
    realQaSignals["440001"],
  );
  assertStep(
    realQaSignals["440002"].signalType === "rumor" &&
      realQaSignals["440002"].riskLevel === "medium",
    "DCInside tweet rumor classification failed",
    realQaSignals["440002"],
  );
  assertStep(
    realQaSignals["440003"].signalType === "rumor" &&
      realQaSignals["440003"].riskLevel === "high" &&
      realQaSignals["440003"].verificationStatus === "needs_manual_review",
    "DCInside high risk classification failed",
    realQaSignals["440003"],
  );
  assertStep(
    realQaSignals["440004"].signalType === "pricing_change",
    "DCInside pricing classification failed",
    realQaSignals["440004"],
  );
  assertStep(
    realQaSignals["440005"].signalType === "service_change" &&
      realQaSignals["440005"].riskLevel === "medium",
    "DCInside service change classification failed",
    realQaSignals["440005"],
  );
  assertStep(
    realQaSignals["440007"].signalType === "early_news" &&
      realQaSignals["440007"].riskLevel === "medium",
    "DCInside upcoming support classification failed",
    realQaSignals["440007"],
  );
  assertStep(
    realQaSignals["440006"].signalType !== "bug_report" &&
      realQaSignals["440006"].meta.category === null,
    "DCInside bug bounty/category classification failed",
    realQaSignals["440006"],
  );
  assertStep(
    realQaSignals["440001"].publishedAt &&
      realQaSignals["440001"].meta.dateParseMode === "same_day_time" &&
      realQaSignals["440002"].meta.dateParseMode === "current_year_month_day" &&
      realQaSignals["440003"].meta.dateParseMode === "short_year_month_day",
    "DCInside date parsing modes failed",
    {
      "440001": realQaSignals["440001"],
      "440002": realQaSignals["440002"],
      "440003": realQaSignals["440003"],
    },
  );

  logStep("DCInside preview QA fixture 저장을 확인합니다.");
  const previewFixturePayload = {
    sourceTab: "info",
    pageUrl: "https://gall.dcinside.com/mgallery/board/lists/?id=thesingularity&sort_type=N&search_head=110&page=1",
    importedCount: dcinsideRealQaPreview.payload.importedCount,
    skippedCount: dcinsideRealQaPreview.payload.skippedCount,
    skipReasonSummary: dcinsideRealQaPreview.payload.skipReasonSummary,
    parserVersion: dcinsideRealQaPreview.payload.parserVersion,
    detectedSourceTab: dcinsideRealQaPreview.payload.detectedSourceTab,
    sourceTabMismatch: dcinsideRealQaPreview.payload.sourceTabMismatch,
    warnings: dcinsideRealQaPreview.payload.warnings,
    signals: dcinsideRealQaPreview.payload.signals,
    createdAt: new Date().toISOString(),
  };
  const savedInfoPreview = await request("POST", `/api/topics/${seeded.topic.id}/community/save-preview-fixture`, {
    sourceTab: "info",
    preview: previewFixturePayload,
  });
  assertStep(
    savedInfoPreview.ok &&
      savedInfoPreview.payload.ok === true &&
      savedInfoPreview.payload.exists === true &&
      savedInfoPreview.payload.sizeBytes > 0 &&
      savedInfoPreview.payload.relativePath === "manual-fixtures/dcinside-info-preview-latest.json" &&
      savedInfoPreview.payload.absolutePath === previewFixturePaths[0] &&
      savedInfoPreview.payload.projectRoot === projectRoot &&
      existsSync(previewFixturePaths[0]),
    "DCInside info preview fixture save failed",
    savedInfoPreview,
  );
  const savedInfoJson = readFileSync(previewFixturePaths[0], "utf8");
  assertStep(
    !/"rawHtml"\s*:|"html"\s*:|"originalHtml"\s*:|<tr|<script|<iframe|onerror\s*=|javascript:/i.test(
      savedInfoJson,
    ),
    "DCInside preview fixture should not include raw HTML",
    savedInfoJson.slice(0, 1200),
  );
  const savedInfoPayload = JSON.parse(savedInfoJson);
  assertStep(
    savedInfoPayload.qaSummary?.signalCount === 7 && savedInfoPayload.signals?.length === 7,
    "DCInside preview fixture QA summary failed",
    savedInfoPayload,
  );

  const rejectedRawHtmlFixture = await request("POST", `/api/topics/${seeded.topic.id}/community/save-preview-fixture`, {
    sourceTab: "info",
    preview: {
      ...previewFixturePayload,
      rawHtml: "<table><tr><td>raw-html-should-not-save</td></tr></table>",
    },
  });
  assertStep(
    !rejectedRawHtmlFixture.ok && rejectedRawHtmlFixture.status === 400,
    "DCInside preview fixture must reject rawHtml fields",
    rejectedRawHtmlFixture,
  );

  const savedBestPreview = await request("POST", `/api/topics/${seeded.topic.id}/community/save-preview-fixture`, {
    sourceTab: "best",
    preview: {
      ...previewFixturePayload,
      sourceTab: "best",
    },
  });
  assertStep(
    savedBestPreview.ok &&
      savedBestPreview.payload.ok === true &&
      savedBestPreview.payload.exists === true &&
      savedBestPreview.payload.sizeBytes > 0 &&
      savedBestPreview.payload.relativePath === "manual-fixtures/dcinside-best-preview-latest.json" &&
      savedBestPreview.payload.absolutePath === previewFixturePaths[1] &&
      existsSync(previewFixturePaths[1]),
    "DCInside best preview fixture save failed",
    savedBestPreview,
  );
  const savedBestPayload = JSON.parse(readFileSync(previewFixturePaths[1], "utf8"));
  assertStep(
    savedBestPayload.sourceTab === "best" && savedBestPayload.signals?.length === 7,
    "DCInside best preview fixture readback failed",
    savedBestPayload,
  );

  const communityPage = await fetch(`${appBaseUrl}/topics/${seeded.topic.id}/community`).then((response) => response.text());
  assertStep(
    communityPage.includes("미리보기 JSON 복사") &&
      communityPage.includes("미리보기 JSON 다운로드") &&
      communityPage.includes("QA 파일로 저장"),
    "Community preview buttons missing",
    { preview: communityPage.slice(0, 1200) },
  );
  const formSource = readFileSync(path.join(projectRoot, "components/dcinside-html-import-form.tsx"), "utf8");
  assertStep(
    formSource.includes("미리보기 결과가 없습니다. 먼저 파싱 미리보기를 실행하세요.") &&
      formSource.includes("미리보기 JSON을 복사했습니다.") &&
      formSource.includes("dcinside-${previewResult.sourceTab || \"unknown\"}-preview.json") &&
      formSource.includes("/community/save-preview-fixture") &&
      formSource.includes("QA 파일로 저장했습니다") &&
      formSource.includes("payload.ok !== true") &&
      formSource.includes("payload.exists !== true") &&
      formSource.includes("formatBytes(payload.sizeBytes)") &&
      formSource.includes("먼저 파싱 미리보기를 실행하세요.") &&
      formSource.includes("signals") &&
      formSource.includes("skipReasonSummary") &&
      formSource.includes("hasImage true") &&
      !formSource.includes("html: previewResult"),
    "Community preview copy/download source check failed",
    {},
  );

  logStep("CommunitySignal 기반 TrendCandidate sourceMetaJson을 확인합니다.");
  const dcinsideSave = await request("POST", `/api/topics/${seeded.topic.id}/community/import-html`, {
    mode: "save",
    sourceTab: "best",
    pageUrl:
      "https://gall.dcinside.com/mgallery/board/lists/?id=thesingularity&sort_type=N&search_head=110&page=1",
    html: dcinsideRealQaFixture,
  });
  assertStep(dcinsideSave.ok && dcinsideSave.payload.importedCount === 7, "DCInside save for sourceMeta failed", dcinsideSave);
  const sourceSignal = dcinsideSave.payload.signals.find((signal) =>
    signal.title.includes("클로드 프로, 클코에 오푸스 제공 중단 예정"),
  );
  assertStep(Boolean(sourceSignal?.id), "source signal for candidate creation missing", dcinsideSave);
  const candidateFromSignal = await request(
    "POST",
    `/api/topics/${seeded.topic.id}/community/signals/${sourceSignal.id}/create-candidate`,
  );
  assertStep(
    candidateFromSignal.ok &&
      candidateFromSignal.payload.candidate?.verdict === "review_first" &&
      candidateFromSignal.payload.candidate?.scoringBasis === "community_unverified",
    "community source candidate creation failed",
    candidateFromSignal,
  );
  const sourceMeta = JSON.parse(candidateFromSignal.payload.candidate.sourceMetaJson ?? "{}");
  assertStep(
    sourceMeta.sourceType === sourceSignal.sourceType &&
      sourceMeta.sourceName === sourceSignal.sourceName &&
      sourceMeta.signalTitle === sourceSignal.title &&
      sourceMeta.signalUrl === sourceSignal.url &&
      sourceMeta.signalType === sourceSignal.signalType &&
      sourceMeta.riskLevel === sourceSignal.riskLevel &&
      sourceMeta.verificationStatus === sourceSignal.verificationStatus &&
      sourceMeta.sourceTab === sourceSignal.sourceTab &&
      !/rawHtml|originalHtml|<tr|<script|<iframe|onerror/i.test(JSON.stringify(sourceMeta)),
    "community sourceMetaJson shape failed",
    { sourceMeta, sourceSignal },
  );
  const trendsPage = await fetch(`${appBaseUrl}/topics/${seeded.topic.id}/trends`).then((response) => response.text());
  const escapedSignalUrl = sourceSignal.url.replaceAll("&", "&amp;");
  assertStep(
    trendsPage.includes("커뮤니티 조기 신호입니다. 공식 확인 전 사실로 단정하지 마세요.") &&
      trendsPage.includes(sourceSignal.title) &&
      trendsPage.includes(escapedSignalUrl) &&
      trendsPage.includes(sourceSignal.riskLevel) &&
      trendsPage.includes(sourceSignal.verificationStatus),
    "community sourceMeta UI display failed",
    { preview: trendsPage.slice(0, 1800), sourceMeta },
  );

  logStep("DCInside 후보를 GitHub Issues로 보강 검색합니다.");
  const githubReinforcement = await request(
    "POST",
    `/api/topics/${seeded.topic.id}/candidates/${candidateFromSignal.payload.candidate.id}/collect-github-issues`,
  );
  const githubIssueSignals = githubReinforcement.payload.signals.filter(
    (signal) => signal.sourceType === "github_issues",
  );
  const uniqueGithubIssueUrls = new Set(githubIssueSignals.map((signal) => signal.url));
  assertStep(
    githubReinforcement.ok &&
      githubReinforcement.payload.signalCount >= 1 &&
      githubIssueSignals.length === uniqueGithubIssueUrls.size &&
      githubReinforcement.payload.warnings?.some((warning) => warning.includes("GITHUB_TOKEN")) &&
      githubReinforcement.payload.candidate?.verdict !== "write_now",
    "GitHub Issues reinforcement failed",
    { githubReinforcement, githubIssueSignals },
  );
  const githubIssueSignal = githubIssueSignals[0];
  const githubIssueMeta = JSON.parse(githubIssueSignal?.rawMetaJson ?? "{}");
  assertStep(
    githubIssueSignal?.title &&
      githubIssueSignal.url?.includes("github.com/anthropics/claude-code/issues/42") &&
      githubIssueSignal.commentCount === 18 &&
      githubIssueSignal.reactionCount === 7 &&
      githubIssueSignal.externalId === "anthropics/claude-code#42" &&
      githubIssueSignal.canonicalUrl === "https://github.com/anthropics/claude-code/issues/42" &&
      githubIssueSignal.verificationStatus === "needs_manual_review" &&
      githubIssueSignal.confidence === "medium" &&
      githubIssueMeta.repository === "anthropics/claude-code" &&
      githubIssueMeta.repositoryUrl === "https://api.github.com/repos/anthropics/claude-code" &&
      githubIssueMeta.githubIssueId === 101 &&
      githubIssueMeta.nodeId === "MOCK_github_issue_101" &&
      githubIssueMeta.htmlUrl === "https://github.com/anthropics/claude-code/issues/42" &&
      githubIssueMeta.comments === 18 &&
      githubIssueMeta.reactionsTotalCount === 7 &&
      githubIssueMeta.externalId === "anthropics/claude-code#42" &&
      githubIssueMeta.metadataOnly === true &&
      !/body|commentBody|rawHtml|originalHtml|<script|<iframe|onerror|javascript:/i.test(
        JSON.stringify(githubIssueSignal),
      ),
    "GitHub issue signal metadata failed",
    { githubIssueSignal, githubIssueMeta },
  );
  const githubCollectorSource = readFileSync(
    path.join(projectRoot, "lib/community/collectors/github/github-issues-collector.ts"),
    "utf8",
  );
  assertStep(
    githubCollectorSource.includes("buildGitHubIssueSearchQueries") &&
      githubCollectorSource.includes("GITHUB_ISSUES_SEARCH_FACETS") &&
      !githubCollectorSource.includes(" OR "),
    "GitHub issue query split source check failed",
    {},
  );
  assertStep(
    githubReinforcement.payload.candidate?.scoringBasis === "external_data" &&
      githubReinforcement.payload.candidate?.confidence === "medium" &&
      githubReinforcement.payload.candidate?.scoringReason?.includes("GitHub Issues 보강 신호"),
    "GitHub cross-source score reflection failed",
    githubReinforcement.payload.candidate,
  );
  const trendsPageAfterGithub = await fetch(`${appBaseUrl}/topics/${seeded.topic.id}/trends`).then((response) =>
    response.text(),
  );
  assertStep(
      trendsPageAfterGithub.includes("GitHub Issues로 보강 검색") &&
      trendsPageAfterGithub.includes("GitHub Issues 보강 신호") &&
      trendsPageAfterGithub.includes("anthropics/claude-code") &&
      trendsPageAfterGithub.includes("GitHub 이슈 보강 신호입니다. 공식 repo 여부와 문서/릴리즈 확인이 필요할 수 있습니다."),
    "GitHub issue UI display failed",
    { preview: trendsPageAfterGithub.slice(0, 2200) },
  );

  logStep("수동 커뮤니티 소스를 추가합니다.");
  const manual = await request("POST", `/api/topics/${seeded.topic.id}/community`, {
    candidateId: seeded.strong.id,
    sourceName: "수동 QA 출처",
    url: "https://example.com/community/manual-source",
    title: "블로그 자동화 스택 선택에서 provider 실패 처리가 헷갈린다는 의견",
    summary: "수동 입력 출처의 요약입니다. 직접 경험이 아닌 외부 반응으로만 취급합니다.",
    signalType: "operational_issue",
    observedAt: new Date().toISOString().slice(0, 10),
  });
  assertStep(manual.ok, "manual community source failed", manual);

  const prismaManual = new PrismaClient();
  const afterManual = await prismaManual.trendCandidate.findUnique({ where: { id: seeded.strong.id } });
  await prismaManual.$disconnect();
  assertStep(afterManual?.verdict !== "write_now", "single source should not be write_now", afterManual);

  logStep("루머 수동 소스를 추가합니다.");
  const rumorManual = await request("POST", `/api/topics/${seeded.topic.id}/community`, {
    candidateId: seeded.rumor.id,
    sourceName: "수동 루머 출처",
    url: "https://example.com/community/rumor-source",
    title: "미확인 AI 도구 출시 루머",
    summary: "확인되지 않은 루머성 반응입니다.",
    signalType: "rumor",
    observedAt: new Date().toISOString().slice(0, 10),
  });
  assertStep(rumorManual.ok, "manual rumor source failed", rumorManual);

  logStep("mock Community Radar 수집을 실행합니다.");
  const collected = await request("POST", `/api/topics/${seeded.topic.id}/collect-community`);
  assertStep(collected.ok, "collect-community failed", collected);
  assertStep(collected.payload.collectionStatus === "success", "community collection status failed", collected.payload);

  const strongCandidate = collected.payload.candidates.find((candidate) => candidate.id === seeded.strong.id);
  const rumorCandidate = collected.payload.candidates.find((candidate) => candidate.id === seeded.rumor.id);
  assertStep(strongCandidate?.scoringBasis === "external_data", "community scoreBasis failed", strongCandidate);
  assertStep(
    strongCandidate?.verdict !== "write_now",
    "community-only signals should not allow write_now without official confirmation",
    strongCandidate,
  );
  assertStep((rumorCandidate?.riskPenalty ?? 0) < -8, "rumor penalty was not applied", rumorCandidate);
  assertStep(rumorCandidate?.verdict !== "write_now", "rumor signal should not be write_now", rumorCandidate);

  const prismaAfter = new PrismaClient();
  const signalCount = await prismaAfter.communitySignal.count({
    where: { candidate: { topicId: seeded.topic.id } },
  });
  const successLog = await prismaAfter.generationLog.findFirst({
    where: { action: "collectCommunitySignals", generationStatus: "success" },
    orderBy: { createdAt: "desc" },
  });
  await prismaAfter.$disconnect();

  assertStep(signalCount >= 6, "community signal count failed", { signalCount });
  assertStep(Boolean(successLog), "community generation log missing", { successLog });
  await stopDevServer();
  const cleanupDb = await cleanupSqliteDb();
  await cleanupPreviewFixtures();

  console.log(
    JSON.stringify(
      {
        ok: true,
        topicId: seeded.topic.id,
        signalCount,
        strongCandidate: {
          keyword: strongCandidate.keyword,
          totalScore: strongCandidate.totalScore,
          verdict: strongCandidate.verdict,
          scoringBasis: strongCandidate.scoringBasis,
          confidence: strongCandidate.confidence,
        },
        rumorCandidate: {
          keyword: rumorCandidate.keyword,
          totalScore: rumorCandidate.totalScore,
          verdict: rumorCandidate.verdict,
          riskPenalty: rumorCandidate.riskPenalty,
        },
        cleanupDb,
        cleanupPreviewFixtures: "cleaned",
      },
      null,
      2,
    ),
  );
} catch (error) {
  await stopDevServer();
  await cleanupPreviewFixtures().catch(() => undefined);
  console.error(sanitize(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
