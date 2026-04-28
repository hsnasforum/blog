import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { DcinsideSourceTab } from "@/lib/community/collectors/dcinside/dcinside-types";

type JsonRecord = Record<string, unknown>;

const fixtureFileNames: Record<DcinsideSourceTab, string> = {
  info: "dcinside-info-preview-latest.json",
  best: "dcinside-best-preview-latest.json",
};

export const dcinsidePreviewFixturePaths: Record<DcinsideSourceTab, string> = {
  info: `manual-fixtures/${fixtureFileNames.info}`,
  best: `manual-fixtures/${fixtureFileNames.best}`,
};

const maxFixtureBytes = 500_000;
const forbiddenPreviewKeys = new Set(["rawhtml", "html", "originalhtml"]);
const dangerousHtmlPattern =
  /<\s*(?:html|body|table|thead|tbody|tr|td|script|iframe|object|embed)\b|\son[a-z]+\s*=|javascript\s*:/i;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function findForbiddenKey(value: unknown, pathParts: string[] = []): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = findForbiddenKey(value[index], [...pathParts, String(index)]);
      if (nested) return nested;
    }
    return null;
  }

  if (!isRecord(value)) return null;

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    const currentPath = [...pathParts, key];

    if (forbiddenPreviewKeys.has(normalizedKey)) {
      return currentPath.join(".");
    }

    const nested = findForbiddenKey(nestedValue, currentPath);
    if (nested) return nested;
  }

  return null;
}

function textValue(record: JsonRecord, key: string): string | null {
  const value = record[key];
  if (typeof value === "string") return value;
  return null;
}

function numberValue(record: JsonRecord, key: string): number {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function booleanValue(record: JsonRecord, key: string): boolean {
  return record[key] === true;
}

function recordValue(record: JsonRecord, key: string): JsonRecord | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function parseRawMetaJson(signal: JsonRecord): JsonRecord {
  const rawMetaJson = textValue(signal, "rawMetaJson");
  if (!rawMetaJson) return {};

  try {
    const parsed = JSON.parse(rawMetaJson) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeSignal(signal: unknown): JsonRecord | null {
  if (!isRecord(signal)) return null;

  const title = textValue(signal, "title");
  const url = textValue(signal, "url");
  if (!title || !url) return null;

  return {
    externalId: textValue(signal, "externalId"),
    title,
    url,
    canonicalUrl: textValue(signal, "canonicalUrl"),
    sourceName: textValue(signal, "sourceName"),
    sourceTab: textValue(signal, "sourceTab"),
    detectedSourceTab: textValue(signal, "detectedSourceTab"),
    publishedAt: textValue(signal, "publishedAt"),
    viewCount: numberValue(signal, "viewCount"),
    commentCount: numberValue(signal, "commentCount"),
    recommendCount: numberValue(signal, "recommendCount"),
    signalType: textValue(signal, "signalType"),
    riskLevel: textValue(signal, "riskLevel"),
    verificationStatus: textValue(signal, "verificationStatus"),
    confidence: textValue(signal, "confidence"),
    rawMetaJson: textValue(signal, "rawMetaJson"),
  };
}

function countBy(signals: JsonRecord[], key: string): Record<string, number> {
  return signals.reduce<Record<string, number>>((counts, signal) => {
    const value = textValue(signal, key) ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function ratio(count: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((count / total) * 100)}%`;
}

function buildQaSummary(preview: JsonRecord, signals: JsonRecord[]) {
  const metaList = signals.map(parseRawMetaJson);
  const hasImageTrueCount = metaList.filter((meta) => meta.hasImage === true).length;
  const publishedAtParsedCount = signals.filter((signal) => Boolean(textValue(signal, "publishedAt"))).length;
  const categoryNullCount = metaList.filter((meta) => !textValue(meta, "category")).length;
  const skippedCount = numberValue(preview, "skippedCount");

  return {
    signalCount: signals.length,
    skippedCount,
    sourceTab: textValue(preview, "sourceTab"),
    detectedSourceTab: textValue(preview, "detectedSourceTab"),
    sourceTabMismatch: booleanValue(preview, "sourceTabMismatch"),
    riskCounts: countBy(signals, "riskLevel"),
    signalTypeCounts: countBy(signals, "signalType"),
    hasImageTrueCount,
    hasImageTrueRate: ratio(hasImageTrueCount, signals.length),
    publishedAtParseRate: ratio(publishedAtParsedCount, signals.length),
    categoryNullRate: ratio(categoryNullCount, signals.length),
  };
}

function sanitizePreview(sourceTab: DcinsideSourceTab, preview: unknown) {
  if (!isRecord(preview)) {
    return { ok: false as const, error: "preview는 JSON 객체여야 합니다.", status: 400 };
  }

  const forbiddenKey = findForbiddenKey(preview);
  if (forbiddenKey) {
    return {
      ok: false as const,
      error: `원문 HTML로 보이는 필드는 QA fixture에 저장할 수 없습니다: ${forbiddenKey}`,
      status: 400,
    };
  }

  const signalsInput = Array.isArray(preview.signals) ? preview.signals : [];
  const signals = signalsInput.map(sanitizeSignal).filter((signal): signal is JsonRecord => Boolean(signal));
  const sanitized = {
    sourceTab,
    pageUrl: textValue(preview, "pageUrl"),
    importedCount: numberValue(preview, "importedCount"),
    skippedCount: numberValue(preview, "skippedCount"),
    skipReasonSummary: recordValue(preview, "skipReasonSummary") ?? {},
    parserVersion: textValue(preview, "parserVersion"),
    detectedSourceTab: textValue(preview, "detectedSourceTab"),
    sourceTabMismatch: booleanValue(preview, "sourceTabMismatch"),
    warnings: Array.isArray(preview.warnings) ? preview.warnings.filter((warning) => typeof warning === "string") : [],
    qaSummary: buildQaSummary(preview, signals),
    signals,
    createdAt: textValue(preview, "createdAt") ?? new Date().toISOString(),
    savedAt: new Date().toISOString(),
  };

  const serialized = JSON.stringify(sanitized, null, 2);
  if (dangerousHtmlPattern.test(serialized)) {
    return {
      ok: false as const,
      error: "QA fixture에 원문 HTML 또는 위험한 HTML 조각이 포함되어 저장을 중단했습니다.",
      status: 400,
    };
  }

  const bytes = new TextEncoder().encode(serialized).length;
  if (bytes > maxFixtureBytes) {
    return {
      ok: false as const,
      error: `QA fixture가 너무 큽니다. ${maxFixtureBytes} bytes 이하로 줄여주세요.`,
      status: 413,
    };
  }

  return { ok: true as const, serialized, bytes };
}

function fixtureTarget(sourceTab: DcinsideSourceTab) {
  const projectRoot = process.cwd();
  const targetDir = path.join(projectRoot, "manual-fixtures");
  const targetFile = fixtureFileNames[sourceTab];
  const targetPath = path.join(targetDir, targetFile);
  const relativePath = `manual-fixtures/${targetFile}`;

  return {
    projectRoot,
    targetDir,
    targetFile,
    targetPath,
    relativePath,
  };
}

async function verifyWrittenFixture(targetPath: string) {
  const fileStat = await stat(targetPath);
  if (!fileStat.isFile() || fileStat.size <= 0) {
    return {
      ok: false as const,
      error: "QA fixture 저장 후 파일 크기 확인에 실패했습니다.",
    };
  }

  const readBack = await readFile(targetPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(readBack) as unknown;
  } catch (error) {
    return {
      ok: false as const,
      error: `QA fixture 저장 후 JSON parse에 실패했습니다: ${
        error instanceof Error ? error.message : "unknown_error"
      }`,
    };
  }

  const forbiddenKey = findForbiddenKey(parsed);
  if (forbiddenKey) {
    return {
      ok: false as const,
      error: `QA fixture 저장 후 금지 필드가 확인되었습니다: ${forbiddenKey}`,
    };
  }

  if (dangerousHtmlPattern.test(JSON.stringify(parsed))) {
    return {
      ok: false as const,
      error: "QA fixture 저장 후 원문 HTML 또는 위험한 HTML 조각이 확인되었습니다.",
    };
  }

  return {
    ok: true as const,
    sizeBytes: fileStat.size,
  };
}

export async function saveDcinsidePreviewFixture({
  sourceTab,
  preview,
}: {
  sourceTab: DcinsideSourceTab;
  preview: unknown;
}) {
  const sanitized = sanitizePreview(sourceTab, preview);
  if (!sanitized.ok) return sanitized;

  const target = fixtureTarget(sourceTab);

  try {
    await mkdir(target.targetDir, { recursive: true });
    await writeFile(target.targetPath, `${sanitized.serialized}\n`, "utf8");

    const verified = await verifyWrittenFixture(target.targetPath);
    if (!verified.ok) {
      return {
        ok: false as const,
        status: 500,
        message: "QA fixture 저장 후 파일 확인에 실패했습니다.",
        error: verified.error,
        projectRoot: target.projectRoot,
        targetPath: target.targetPath,
      };
    }

    return {
      ok: true as const,
      relativePath: target.relativePath,
      absolutePath: target.targetPath,
      exists: true,
      sizeBytes: verified.sizeBytes,
      projectRoot: target.projectRoot,
      path: target.relativePath,
      bytes: verified.sizeBytes,
    };
  } catch (error) {
    return {
      ok: false as const,
      status: 500,
      message: "QA fixture 저장 후 파일 확인에 실패했습니다.",
      error: error instanceof Error ? error.message : "unknown_error",
      projectRoot: target.projectRoot,
      targetPath: target.targetPath,
    };
  }
}
