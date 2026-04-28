import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { parseDcinsideListHtml } from "@/lib/community/collectors/dcinside/dcinside-list-parser";
import { normalizeDcinsideSignal } from "@/lib/community/collectors/dcinside/dcinside-signal-normalizer";
import type { DcinsideSourceTab, NormalizedDcinsideSignal } from "@/lib/community/collectors/dcinside/dcinside-types";
import { rescoreCommunityCandidate } from "@/lib/community/collect-community-signals";
import { isSafeHttpUrl } from "@/lib/community/community-utils";

export const dcinsideManualHtmlMaxBytes = 500_000;

type ManualImportMode = "preview" | "save";

type ImportParams = {
  topicId: string;
  sourceTab: DcinsideSourceTab;
  pageUrl?: string | null;
  html: string;
  candidateId?: string | null;
  mode?: ManualImportMode;
};

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function signalKey(signal: Pick<NormalizedDcinsideSignal, "externalId" | "canonicalUrl" | "sourceTab">) {
  return `${signal.sourceTab}:${signal.externalId || signal.canonicalUrl}`;
}

function toCreateInput(params: {
  topicId: string;
  candidateId?: string | null;
  signal: NormalizedDcinsideSignal;
  importBatchId: string;
}): Prisma.CommunitySignalCreateInput {
  return {
    topic: { connect: { id: params.topicId } },
    candidate: params.candidateId ? { connect: { id: params.candidateId } } : undefined,
    sourceType: params.signal.sourceType,
    sourceName: params.signal.sourceName,
    sourceTab: params.signal.sourceTab,
    externalId: params.signal.externalId,
    canonicalUrl: params.signal.canonicalUrl,
    title: params.signal.title,
    url: params.signal.url,
    publishedAt: params.signal.publishedAt,
    observedAt: params.signal.publishedAt,
    score: params.signal.score,
    viewCount: params.signal.viewCount,
    commentCount: params.signal.commentCount,
    reactionCount: params.signal.reactionCount,
    recommendCount: params.signal.recommendCount,
    summary: params.signal.summary,
    signalType: params.signal.signalType,
    riskLevel: params.signal.riskLevel,
    verificationStatus: params.signal.verificationStatus,
    confidence: params.signal.confidence,
    rawMetaJson: params.signal.rawMetaJson,
    linksJson: JSON.stringify([{ title: params.signal.title, url: params.signal.url }]),
    importMethod: "manual_html_import",
    importBatchId: params.importBatchId,
    status: "success",
  };
}

function serializeSignal(signal: NormalizedDcinsideSignal) {
  return {
    sourceType: signal.sourceType,
    sourceName: signal.sourceName,
    sourceTab: signal.sourceTab,
    detectedSourceTab: signal.detectedSourceTab,
    externalId: signal.externalId,
    canonicalUrl: signal.canonicalUrl,
    title: signal.title,
    url: signal.url,
    publishedAt: signal.publishedAt,
    viewCount: signal.viewCount,
    commentCount: signal.commentCount,
    reactionCount: signal.reactionCount,
    recommendCount: signal.recommendCount,
    summary: signal.summary,
    signalType: signal.signalType,
    riskLevel: signal.riskLevel,
    verificationStatus: signal.verificationStatus,
    confidence: signal.confidence,
    rawMetaJson: signal.rawMetaJson,
  };
}

export async function importDcinsideManualHtml(params: ImportParams) {
  const trimmedHtml = params.html.trim();
  if (!trimmedHtml) {
    return {
      ok: false as const,
      status: 400,
      error: "HTML 입력이 비어 있습니다.",
    };
  }

  if (byteLength(trimmedHtml) > dcinsideManualHtmlMaxBytes) {
    return {
      ok: false as const,
      status: 413,
      error: "HTML 입력 크기가 너무 큽니다. 목록 HTML 일부만 붙여넣어 주세요.",
    };
  }

  if (params.pageUrl?.trim() && !isSafeHttpUrl(params.pageUrl.trim())) {
    return {
      ok: false as const,
      status: 400,
      error: "pageUrl은 http 또는 https URL이어야 합니다.",
    };
  }

  const topic = await prisma.topic.findUnique({
    where: { id: params.topicId },
    include: { trendCandidates: true },
  });
  if (!topic) {
    return {
      ok: false as const,
      status: 404,
      error: "토픽을 찾을 수 없습니다.",
    };
  }

  if (params.candidateId) {
    const belongsToTopic = topic.trendCandidates.some((candidate) => candidate.id === params.candidateId);
    if (!belongsToTopic) {
      return {
        ok: false as const,
        status: 400,
        error: "해당 토픽의 후보에만 커뮤니티 신호를 연결할 수 있습니다.",
      };
    }
  }

  const parsed = parseDcinsideListHtml({
    html: trimmedHtml,
    sourceTab: params.sourceTab,
    pageUrl: params.pageUrl,
  });
  const normalized = parsed.items.map(normalizeDcinsideSignal);
  const uniqueSignals = normalized.filter((signal, index, all) =>
    all.findIndex((item) => signalKey(item) === signalKey(signal)) === index,
  );

  if ((params.mode ?? "save") === "preview") {
    return {
      ok: true as const,
      mode: "preview" as const,
      importedCount: 0,
      skippedCount: parsed.skippedCount,
      skipReasonSummary: parsed.skipReasons,
      parserVersion: parsed.parserVersion,
      detectedSourceTab: parsed.detectedSourceTab,
      sourceTabMismatch: parsed.sourceTabMismatch,
      warnings: parsed.warnings,
      signals: uniqueSignals.map(serializeSignal),
    };
  }

  const importBatchId = randomUUID();
  const savedSignals = [];
  let duplicateCount = 0;

  for (const signal of uniqueSignals) {
    const existing = await prisma.communitySignal.findFirst({
      where: {
        sourceType: "dcinside",
        sourceTab: signal.sourceTab,
        OR: [
          { externalId: signal.externalId },
          { canonicalUrl: signal.canonicalUrl },
          { url: signal.url },
        ],
      },
    });

    if (existing) {
      duplicateCount += 1;
      continue;
    }

    const saved = await prisma.communitySignal.create({
      data: toCreateInput({
        topicId: topic.id,
        candidateId: params.candidateId,
        signal,
        importBatchId,
      }),
    });
    savedSignals.push(saved);
  }

  if (params.candidateId && savedSignals.length > 0) {
    await rescoreCommunityCandidate(params.candidateId);
  }

  await prisma.generationLog.create({
    data: {
      action: "importDcinsideManualHtml",
      provider: "manual",
      model: "dcinside-manual-html-import",
      inputSummary: `topic=${topic.rawTopic}, sourceTab=${params.sourceTab}, candidateId=${params.candidateId ?? "unlinked"}`,
      outputSummary: `imported=${savedSignals.length}, skipped=${parsed.skippedCount + duplicateCount}`,
      status: "success",
      generationStatus: "success",
    },
  });

  return {
    ok: true as const,
    mode: "save" as const,
      importBatchId,
      importedCount: savedSignals.length,
      skippedCount: parsed.skippedCount + duplicateCount,
      skipReasonSummary: {
        ...parsed.skipReasons,
        duplicate: parsed.skipReasons.duplicate + duplicateCount,
      },
      parserVersion: parsed.parserVersion,
      detectedSourceTab: parsed.detectedSourceTab,
      sourceTabMismatch: parsed.sourceTabMismatch,
      warnings: parsed.warnings,
      signals: savedSignals,
    };
}
