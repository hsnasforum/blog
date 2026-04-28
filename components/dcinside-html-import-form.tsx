"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CommunityCandidateOption = {
  id: string;
  keyword: string;
};

type PreviewSignal = {
  externalId?: string | null;
  title: string;
  url: string;
  canonicalUrl?: string | null;
  sourceName?: string;
  sourceTab: string;
  detectedSourceTab?: string | null;
  publishedAt?: string | null;
  viewCount: number;
  commentCount: number;
  recommendCount: number;
  signalType: string;
  riskLevel: string;
  verificationStatus: string;
  confidence?: string;
  rawMetaJson?: string | null;
};

type PreviewResult = {
  sourceTab: string;
  pageUrl: string;
  importedCount: number;
  skippedCount: number;
  skipReasonSummary?: Record<string, number>;
  parserVersion?: string;
  detectedSourceTab?: string | null;
  sourceTabMismatch?: boolean;
  warnings?: string[];
  createdAt: string;
  signals: PreviewSignal[];
};

type PreviewSummary = {
  signalCount: number;
  skippedCount: number;
  sourceTab: string;
  detectedSourceTab: string;
  sourceTabMismatch: boolean;
  riskCounts: Record<string, number>;
  signalTypeCounts: Record<string, number>;
  missingTitleOrUrlRows: number;
  hasImageTrueCount: number;
  hasImageTrueRate: string;
  viewCountRate: string;
  commentCountRate: string;
  recommendCountRate: string;
  publishedAtParseRate: string;
  categoryNullRate: string;
};

type SavePreviewFixtureResponse = {
  ok?: boolean;
  relativePath?: string;
  absolutePath?: string;
  exists?: boolean;
  sizeBytes?: number;
  message?: string;
  error?: string;
};

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0KB";
  return `${(bytes / 1024).toFixed(1)}KB`;
}

function safeParseMeta(signal: PreviewSignal): { hasImage?: boolean; category?: string | null; dateParseMode?: string } {
  if (!signal.rawMetaJson) return {};

  try {
    return JSON.parse(signal.rawMetaJson) as { hasImage?: boolean };
  } catch {
    return {};
  }
}

function numericRate(signals: PreviewSignal[], key: "viewCount" | "commentCount" | "recommendCount") {
  if (signals.length === 0) return "0%";
  const parsedCount = signals.filter((signal) => Number.isFinite(signal[key])).length;
  return `${Math.round((parsedCount / signals.length) * 100)}%`;
}

function ratio(count: number, total: number) {
  if (total === 0) return "0%";
  return `${Math.round((count / total) * 100)}%`;
}

function buildPreviewSummary(result: PreviewResult): PreviewSummary {
  const riskCounts = result.signals.reduce<Record<string, number>>((counts, signal) => {
    counts[signal.riskLevel] = (counts[signal.riskLevel] ?? 0) + 1;
    return counts;
  }, {});
  const signalTypeCounts = result.signals.reduce<Record<string, number>>((counts, signal) => {
    counts[signal.signalType] = (counts[signal.signalType] ?? 0) + 1;
    return counts;
  }, {});
  const skipReasonSummary = result.skipReasonSummary ?? {};
  const missingTitleOrUrlRows =
    (skipReasonSummary.missing_title ?? 0) +
    (skipReasonSummary.missing_url ?? 0) +
    (skipReasonSummary.missing_external_id ?? 0);
  const metaList = result.signals.map(safeParseMeta);
  const hasImageTrueCount = metaList.filter((meta) => meta.hasImage === true).length;
  const publishedAtParsedCount = result.signals.filter((signal) => Boolean(signal.publishedAt)).length;
  const categoryNullCount = metaList.filter((meta) => !meta.category).length;

  return {
    signalCount: result.signals.length,
    skippedCount: result.skippedCount,
    sourceTab: result.sourceTab,
    detectedSourceTab: result.detectedSourceTab ?? "-",
    sourceTabMismatch: Boolean(result.sourceTabMismatch),
    riskCounts,
    signalTypeCounts,
    missingTitleOrUrlRows,
    hasImageTrueCount,
    hasImageTrueRate: ratio(hasImageTrueCount, result.signals.length),
    viewCountRate: numericRate(result.signals, "viewCount"),
    commentCountRate: numericRate(result.signals, "commentCount"),
    recommendCountRate: numericRate(result.signals, "recommendCount"),
    publishedAtParseRate: ratio(publishedAtParsedCount, result.signals.length),
    categoryNullRate: ratio(categoryNullCount, result.signals.length),
  };
}

function previewExportPayload(result: PreviewResult, qaSummary?: PreviewSummary | null) {
  return {
    sourceTab: result.sourceTab,
    pageUrl: result.pageUrl,
    importedCount: result.importedCount,
    skippedCount: result.skippedCount,
    skipReasonSummary: result.skipReasonSummary,
    detectedSourceTab: result.detectedSourceTab,
    sourceTabMismatch: result.sourceTabMismatch,
    warnings: result.warnings,
    qaSummary,
    signals: result.signals,
    parserVersion: result.parserVersion,
    createdAt: result.createdAt,
  };
}

function previewJson(result: PreviewResult, qaSummary?: PreviewSummary | null) {
  return JSON.stringify(previewExportPayload(result, qaSummary), null, 2);
}

function downloadJson(filename: string, content: string) {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function DcinsideHtmlImportForm({
  topicId,
  candidates,
}: {
  topicId: string;
  candidates: CommunityCandidateOption[];
}) {
  const router = useRouter();
  const [loadingMode, setLoadingMode] = useState<"preview" | "save" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [savingFixture, setSavingFixture] = useState(false);
  const previewSignals = previewResult?.signals ?? [];
  const previewSummary = previewResult ? buildPreviewSummary(previewResult) : null;

  async function submit(formData: FormData, mode: "preview" | "save") {
    setLoadingMode(mode);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/topics/${topicId}/community/import-html`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          sourceTab: formData.get("sourceTab"),
          pageUrl: formData.get("pageUrl"),
          candidateId: formData.get("candidateId"),
          html: formData.get("html"),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Import 실패");
      }

      if (mode === "preview") {
        setPreviewResult({
          sourceTab: String(formData.get("sourceTab") ?? ""),
          pageUrl: String(formData.get("pageUrl") ?? ""),
          importedCount: payload.importedCount ?? 0,
          skippedCount: payload.skippedCount ?? 0,
          skipReasonSummary: payload.skipReasonSummary,
          parserVersion: payload.parserVersion,
          detectedSourceTab: payload.detectedSourceTab,
          sourceTabMismatch: payload.sourceTabMismatch,
          warnings: payload.warnings,
          createdAt: new Date().toISOString(),
          signals: payload.signals ?? [],
        });
      }
      setMessage(
        mode === "preview"
          ? `미리보기 ${payload.signals?.length ?? 0}개, skip ${payload.skippedCount ?? 0}개`
          : `저장 ${payload.importedCount ?? 0}개, skip ${payload.skippedCount ?? 0}개`,
      );
      if (mode === "save") router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "요청 실패");
    } finally {
      setLoadingMode(null);
    }
  }

  async function copyPreviewJson() {
    setMessage(null);
    setError(null);

    if (!previewResult) {
      setError("미리보기 결과가 없습니다. 먼저 파싱 미리보기를 실행하세요.");
      return;
    }

    try {
      await navigator.clipboard.writeText(previewJson(previewResult, previewSummary));
      setMessage("미리보기 JSON을 복사했습니다.");
    } catch {
      setError("미리보기 JSON 복사에 실패했습니다.");
    }
  }

  function downloadPreviewJson() {
    setMessage(null);
    setError(null);

    if (!previewResult) {
      setError("미리보기 결과가 없습니다. 먼저 파싱 미리보기를 실행하세요.");
      return;
    }

    downloadJson(
      `dcinside-${previewResult.sourceTab || "unknown"}-preview.json`,
      previewJson(previewResult, previewSummary),
    );
    setMessage("미리보기 JSON을 다운로드했습니다.");
  }

  async function savePreviewFixture() {
    setMessage(null);
    setError(null);

    if (!previewResult) {
      setError("먼저 파싱 미리보기를 실행하세요.");
      return;
    }

    setSavingFixture(true);

    try {
      const response = await fetch(`/api/topics/${topicId}/community/save-preview-fixture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceTab: previewResult.sourceTab,
          preview: previewExportPayload(previewResult, previewSummary),
        }),
      });
      const payload = (await response.json()) as SavePreviewFixtureResponse;

      if (!response.ok) {
        throw new Error(payload.message ?? payload.error ?? "QA fixture 저장 실패");
      }

      if (payload.ok !== true || payload.exists !== true || !payload.relativePath || !payload.sizeBytes) {
        throw new Error(payload.message ?? "QA fixture 저장 확인에 실패했습니다.");
      }

      const debugPath =
        process.env.NODE_ENV === "development" && payload.absolutePath ? ` (${payload.absolutePath})` : "";
      setMessage(`QA 파일로 저장했습니다: ${payload.relativePath} (${formatBytes(payload.sizeBytes)})${debugPath}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "QA fixture 저장 실패");
    } finally {
      setSavingFixture(false);
    }
  }

  return (
    <form className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">DCInside Manual HTML Import</h2>
        <p className="mt-1 text-sm text-slate-600">
          특이점갤 정보탭/베스트탭 목록 HTML을 사람이 직접 붙여넣어 파싱합니다. 원문 HTML, 댓글 전문, 이미지는 저장하지 않습니다.
        </p>
        <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          QA 순서: DCInside HTML 붙여넣기 → 파싱 미리보기 → 미리보기 JSON 확인 → QA 파일로 저장 →{" "}
          <span className="font-mono">manual-fixtures/*.json</span> 기준으로 parser QA 진행
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-slate-700">sourceTab</span>
          <select name="sourceTab" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="info">특이점갤 정보탭</option>
            <option value="best">특이점갤 베스트탭</option>
          </select>
        </label>

        <label className="space-y-1 text-sm md:col-span-2">
          <span className="font-medium text-slate-700">pageUrl</span>
          <input
            name="pageUrl"
            type="url"
            placeholder="https://gall.dcinside.com/mgallery/board/lists/?id=thesingularity..."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-slate-700">연결할 후보 선택</span>
        <select name="candidateId" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="">아직 후보에 연결하지 않음</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.keyword}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-slate-700">목록 HTML</span>
        <textarea
          name="html"
          required
          rows={8}
          placeholder="정보탭/베스트탭 목록 영역의 HTML을 붙여넣습니다. 본문/댓글/이미지 원문은 붙여넣지 마세요."
          className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={(event) => {
            const form = event.currentTarget.form;
            if (form) void submit(new FormData(form), "preview");
          }}
          disabled={loadingMode !== null}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
        >
          {loadingMode === "preview" ? "파싱 중..." : "파싱 미리보기"}
        </button>
        <button
          type="button"
          onClick={(event) => {
            const form = event.currentTarget.form;
            if (form) void submit(new FormData(form), "save");
          }}
          disabled={loadingMode !== null}
          className="rounded-md bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
        >
          {loadingMode === "save" ? "저장 중..." : "저장"}
        </button>
        <button
          type="button"
          onClick={() => void copyPreviewJson()}
          disabled={loadingMode !== null || savingFixture}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
        >
          미리보기 JSON 복사
        </button>
        <button
          type="button"
          onClick={downloadPreviewJson}
          disabled={loadingMode !== null || savingFixture}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
        >
          미리보기 JSON 다운로드
        </button>
        <button
          type="button"
          onClick={() => void savePreviewFixture()}
          disabled={loadingMode !== null || savingFixture}
          className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 disabled:opacity-60"
        >
          {savingFixture ? "QA 파일 저장 중..." : "QA 파일로 저장"}
        </button>
        {message ? <span className="text-sm text-emerald-700">{message}</span> : null}
        {error ? <span className="text-sm text-rose-600">{error}</span> : null}
      </div>

      {previewSummary ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <div className="grid gap-2 md:grid-cols-3">
            <p>
              <span className="font-semibold">signals</span> {previewSummary.signalCount} /{" "}
              <span className="font-semibold">skip</span> {previewSummary.skippedCount}
            </p>
            <p>
              <span className="font-semibold">sourceTab</span> {previewSummary.sourceTab}
            </p>
            <p>
              <span className="font-semibold">detectedSourceTab</span> {previewSummary.detectedSourceTab}
            </p>
            <p>
              <span className="font-semibold">sourceTabMismatch</span>{" "}
              {previewSummary.sourceTabMismatch ? "true" : "false"}
            </p>
            <p>
              <span className="font-semibold">title/url 누락 row</span> {previewSummary.missingTitleOrUrlRows}
            </p>
            <p>
              <span className="font-semibold">hasImage true</span> {previewSummary.hasImageTrueCount} (
              {previewSummary.hasImageTrueRate})
            </p>
            <p>
              <span className="font-semibold">count parse</span> views {previewSummary.viewCountRate} / comments{" "}
              {previewSummary.commentCountRate} / rec {previewSummary.recommendCountRate}
            </p>
            <p>
              <span className="font-semibold">publishedAt parse</span> {previewSummary.publishedAtParseRate}
            </p>
            <p>
              <span className="font-semibold">category null</span> {previewSummary.categoryNullRate}
            </p>
            <p>
              <span className="font-semibold">parser</span> {previewResult?.parserVersion ?? "-"}
            </p>
          </div>
          {previewResult?.warnings?.length ? (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
              {previewResult.warnings.join(" ")}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(previewSummary.riskCounts).map(([riskLevel, count]) => (
              <span key={riskLevel} className="rounded border border-slate-200 bg-white px-2 py-1">
                risk {riskLevel}: {count}
              </span>
            ))}
            {Object.entries(previewSummary.signalTypeCounts).map(([signalType, count]) => (
              <span key={signalType} className="rounded border border-slate-200 bg-white px-2 py-1">
                type {signalType}: {count}
              </span>
            ))}
            {Object.entries(previewResult?.skipReasonSummary ?? {}).map(([reason, count]) => (
              <span key={reason} className="rounded border border-slate-200 bg-white px-2 py-1">
                {reason}: {count}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {previewSignals.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2 py-2">title</th>
                <th className="px-2 py-2">engagement</th>
                <th className="px-2 py-2">risk</th>
                <th className="px-2 py-2">verification</th>
              </tr>
            </thead>
            <tbody>
              {previewSignals.slice(0, 10).map((signal) => (
                <tr key={`${signal.sourceTab}:${signal.url}`} className="border-t border-slate-100">
                  <td className="max-w-xl px-2 py-2">
                    <a href={signal.url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                      {signal.title}
                    </a>
                  </td>
                  <td className="px-2 py-2 text-slate-600">
                    views {signal.viewCount} / comments {signal.commentCount} / rec {signal.recommendCount}
                  </td>
                  <td className="px-2 py-2">{signal.riskLevel}</td>
                  <td className="px-2 py-2">{signal.verificationStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </form>
  );
}
