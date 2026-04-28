import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const fixtureTargets = [
  {
    label: "정보탭",
    expectedSourceTab: "info",
    path: path.join(projectRoot, "manual-fixtures/dcinside-info-preview-latest.json"),
  },
  {
    label: "베스트탭",
    expectedSourceTab: "best",
    path: path.join(projectRoot, "manual-fixtures/dcinside-best-preview-latest.json"),
  },
];
const forbiddenKeys = new Set(["rawhtml", "html", "originalhtml"]);

function pct(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function pctText(value) {
  return `${value.toFixed(1).replace(/\.0$/, "")}%`;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function findForbiddenKey(value, parts = []) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = findForbiddenKey(value[index], [...parts, String(index)]);
      if (nested) return nested;
    }
    return null;
  }

  if (!isRecord(value)) return null;

  for (const [key, nested] of Object.entries(value)) {
    const currentPath = [...parts, key];
    if (forbiddenKeys.has(key.toLowerCase())) {
      return currentPath.join(".");
    }
    const nestedKey = findForbiddenKey(nested, currentPath);
    if (nestedKey) return nestedKey;
  }

  return null;
}

function parseMeta(signal) {
  if (!signal?.rawMetaJson || typeof signal.rawMetaJson !== "string") return {};

  try {
    const parsed = JSON.parse(signal.rawMetaJson);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function countBy(values) {
  return values.reduce((counts, value) => {
    const key = value || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function dominantRatio(distribution, total) {
  if (!total) return 0;
  const max = Math.max(0, ...Object.values(distribution));
  return pct(max, total);
}

function expectedRiskFromTitle(title) {
  const normalized = String(title ?? "").toLowerCase();
  if (/유출|찌라시|카더라|미확인|\b\d{1,3}\s*%\s*(?:하락|폭락|감소)\b|50\s*%\s*하락/.test(normalized)) {
    return "high";
  }
  if (/예정|곧\s*지원|제공\s*중단\s*예정|완전\s*섭종|제작중|속보|트윗|\bx\b|x발|캡처|스샷/.test(normalized)) {
    return "medium";
  }
  return "low";
}

function numericParseRate(signals, key) {
  return pct(signals.filter((signal) => Number.isFinite(signal?.[key])).length, signals.length);
}

function candidateScore(signal) {
  const riskPenalty = signal.riskLevel === "high" || signal.riskLevel === "blocked" ? -10_000 : 0;
  const rumorPenalty = signal.signalType === "rumor" ? -2_000 : 0;
  const confidenceBonus = signal.confidence === "high" ? 300 : signal.confidence === "medium" ? 150 : 0;
  const typeBonus = ["product_update", "pricing_change", "service_change", "early_news"].includes(signal.signalType)
    ? 250
    : 0;

  return (
    riskPenalty +
    rumorPenalty +
    typeBonus +
    confidenceBonus +
    (Number(signal.recommendCount) || 0) * 8 +
    (Number(signal.commentCount) || 0) * 5 +
    (Number(signal.viewCount) || 0) / 100
  );
}

function topCandidateSignals(signals) {
  return signals
    .filter((signal) => signal.title && signal.url && signal.externalId)
    .sort((a, b) => candidateScore(b) - candidateScore(a))
    .slice(0, 5)
    .map((signal) => ({
      externalId: signal.externalId,
      title: signal.title,
      url: signal.url,
      signalType: signal.signalType,
      riskLevel: signal.riskLevel,
      viewCount: signal.viewCount,
      commentCount: signal.commentCount,
      recommendCount: signal.recommendCount,
      candidateScore: Math.round(candidateScore(signal) * 10) / 10,
    }));
}

function issue(priority, message) {
  return { priority, message };
}

function analyzeFixture(target) {
  if (!existsSync(target.path)) {
    return {
      label: target.label,
      file: path.relative(projectRoot, target.path),
      exists: false,
      issues: [issue("P0", "fixture 파일이 없습니다.")],
    };
  }

  const raw = readFileSync(target.path, "utf8");
  let fixture;
  try {
    fixture = JSON.parse(raw);
  } catch (error) {
    return {
      label: target.label,
      file: path.relative(projectRoot, target.path),
      exists: true,
      issues: [issue("P0", `fixture JSON parse에 실패했습니다: ${error instanceof Error ? error.message : "unknown_error"}`)],
    };
  }

  const forbiddenKey = findForbiddenKey(fixture);
  const signals = Array.isArray(fixture.signals) ? fixture.signals : [];
  const metaList = signals.map(parseMeta);
  const titleMissingCount = signals.filter((signal) => !signal.title).length;
  const urlMissingCount = signals.filter((signal) => !signal.url).length;
  const externalIdMissingCount = signals.filter((signal) => !signal.externalId).length;
  const missingIdentityCount = signals.filter((signal) => !signal.title || !signal.url || !signal.externalId).length;
  const identityMissingRate = pct(missingIdentityCount, signals.length);
  const hasImageTrueCount = metaList.filter((meta) => meta.hasImage === true).length;
  const hasImageTrueRate = pct(hasImageTrueCount, signals.length);
  const categoryNullCount = metaList.filter((meta) => !meta.category).length;
  const categoryNullRate = pct(categoryNullCount, signals.length);
  const publishedAtParseSuccessRate = pct(signals.filter((signal) => Boolean(signal.publishedAt)).length, signals.length);
  const riskLevelDistribution = countBy(signals.map((signal) => signal.riskLevel));
  const signalTypeDistribution = countBy(signals.map((signal) => signal.signalType));
  const viewParseRate = numericParseRate(signals, "viewCount");
  const commentParseRate = numericParseRate(signals, "commentCount");
  const recommendParseRate = numericParseRate(signals, "recommendCount");
  const issues = [];

  if (forbiddenKey) issues.push(issue("P0", `fixture에 원문 HTML 필드로 취급되는 금지 키가 있습니다: ${forbiddenKey}`));
  if (signals.length === 0) issues.push(issue("P0", "signals.length가 0입니다."));
  if (identityMissingRate >= 30) {
    issues.push(issue("P0", `title/url/externalId 누락률이 ${pctText(identityMissingRate)}입니다.`));
  }
  if (fixture.sourceTab !== target.expectedSourceTab) {
    issues.push(issue("P0", `sourceTab이 예상값과 다릅니다. expected=${target.expectedSourceTab}, actual=${fixture.sourceTab}`));
  }
  if (fixture.sourceTabMismatch === true) {
    issues.push(issue("P0", "sourceTabMismatch=true 입니다."));
  }
  if (hasImageTrueRate >= 80) {
    issues.push(issue("P1", `hasImage true ratio가 ${pctText(hasImageTrueRate)}로 높습니다.`));
  } else if (hasImageTrueRate >= 30) {
    issues.push(issue("warning", `hasImage true ratio가 ${pctText(hasImageTrueRate)}입니다. 첨부 아이콘 오탐 여부를 샘플 확인하세요.`));
  }
  if (dominantRatio(signalTypeDistribution, signals.length) >= 90) {
    issues.push(issue("P1", `signalType이 한 값으로 ${pctText(dominantRatio(signalTypeDistribution, signals.length))} 쏠렸습니다.`));
  }
  if (publishedAtParseSuccessRate < 50) {
    issues.push(issue("P1", `publishedAt parse success ratio가 ${pctText(publishedAtParseSuccessRate)}입니다.`));
  }
  if (categoryNullRate >= 80) {
    issues.push(issue("P2", `category null ratio가 ${pctText(categoryNullRate)}로 높습니다.`));
  }
  const missedRiskSignals = signals
    .filter((signal) => {
      const expectedRisk = expectedRiskFromTitle(signal.title);
      if (expectedRisk === "high") return signal.riskLevel !== "high";
      if (expectedRisk === "medium") return signal.riskLevel === "low";
      return false;
    })
    .slice(0, 5)
    .map((signal) => ({
      externalId: signal.externalId,
      title: signal.title,
      riskLevel: signal.riskLevel,
      expectedRisk: expectedRiskFromTitle(signal.title),
    }));
  if (missedRiskSignals.length > 0) {
    issues.push(issue("P1", `medium/high 키워드가 low 또는 부적절한 riskLevel로 남은 샘플이 있습니다: ${JSON.stringify(missedRiskSignals)}`));
  }

  const skippedCount = Number(fixture.skippedCount) || 0;
  const skipReasonSummary = isRecord(fixture.skipReasonSummary) ? fixture.skipReasonSummary : {};
  const skipReasonTotal = Object.values(skipReasonSummary).reduce((sum, value) => sum + (Number(value) || 0), 0);
  if (skippedCount > 0 && skipReasonTotal < skippedCount) {
    issues.push(issue("P2", "skippedCount보다 skipReasonSummary 합계가 작아 skip reason 보강이 필요합니다."));
  }

  const topSignals = topCandidateSignals(signals);
  if (signals.length > 0 && topSignals.length === 0) {
    issues.push(issue("P2", "후보화할 signal 정렬 기준으로 뽑을 수 있는 항목이 없습니다."));
  }

  return {
    label: target.label,
    file: path.relative(projectRoot, target.path),
    exists: true,
    sourceTab: fixture.sourceTab ?? null,
    detectedSourceTab: fixture.detectedSourceTab ?? null,
    sourceTabMismatch: Boolean(fixture.sourceTabMismatch),
    warnings: Array.isArray(fixture.warnings) ? fixture.warnings : [],
    signalsLength: signals.length,
    skippedCount,
    skipReasonSummary,
    hasImageTrueRatio: pctText(hasImageTrueRate),
    riskLevelDistribution,
    signalTypeDistribution,
    publishedAtParseSuccessRatio: pctText(publishedAtParseSuccessRate),
    categoryNullRatio: pctText(categoryNullRate),
    missingCounts: {
      title: titleMissingCount,
      url: urlMissingCount,
      externalId: externalIdMissingCount,
      anyIdentityField: missingIdentityCount,
      anyIdentityFieldRate: pctText(identityMissingRate),
    },
    parseRates: {
      view: pctText(viewParseRate),
      comment: pctText(commentParseRate),
      recommend: pctText(recommendParseRate),
    },
    topCandidateSignals: topSignals,
    issues,
  };
}

function printReport(reports) {
  const hasP0 = reports.some((report) => report.issues?.some((item) => item.priority === "P0"));

  console.log("# DCInside Preview Fixture QA");
  console.log("");
  console.log(`projectRoot: ${projectRoot}`);
  console.log(`result: ${hasP0 ? "FAIL" : "PASS_WITH_WARNINGS_ALLOWED"}`);
  console.log("");

  for (const report of reports) {
    console.log(`## ${report.label}`);
    console.log(JSON.stringify(report, null, 2));
    console.log("");
  }
}

const reports = fixtureTargets.map(analyzeFixture);
printReport(reports);

if (reports.some((report) => report.issues?.some((item) => item.priority === "P0"))) {
  process.exitCode = 1;
}
